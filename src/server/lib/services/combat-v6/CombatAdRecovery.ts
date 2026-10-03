import { db, type DbTransaction } from '@server/lib/drizzle/db';
import { dungeonRuns } from '@server/lib/drizzle/schema';
import type { DungeonBattlePayload } from '@server/lib/dungeon/combatV6';
import { redis } from '@server/lib/redis';
import { towerRunKey } from '@server/lib/tower/occupancy';
import { SectTaskRecordPayloadSchema } from '@shared/engine/sect';
import type { RecoverySnapshot } from '@shared/rewards/combatRecovery';
import { recoverCombat } from '@shared/rewards/combatRecovery';
import type { TaskInstanceMetadata } from '@shared/types/task';
import { and, eq, ne, sql } from 'drizzle-orm';
import { activeBreakthroughBattle } from './CombatV6BreakthroughOccupancy';
import { activeSectTaskBattle } from './CombatV6SectTaskOccupancy';

type Actor = { userId: string; cultivatorId: string };
type Runtime = {
  cultivatorId: string;
  userId: string;
  battleId: string;
  revision: number;
  latestEventSeq?: number;
  expiresAt?: string;
  metadata?: { sourceType: string };
  host?: RecoverySnapshot;
  snapshot: RecoverySnapshot;
};
type TowerRun = {
  season: { seasonEndsAt: string };
  battle?: {
    id: string;
    revision: number;
    settled: boolean;
    snapshot: RecoverySnapshot;
  };
};
export type LiveRecovery = {
  snapshot: RecoverySnapshot;
  save: (tx: DbTransaction) => Promise<void>;
};
const CAS = `
if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end
if #KEYS == 2 and redis.call('GET',KEYS[2]) ~= ARGV[3] then return 0 end
redis.call('SET',KEYS[1],ARGV[2],'KEEPTTL')
if #KEYS == 2 then redis.call('SET',KEYS[2],ARGV[4],'KEEPTTL') end
return 1`;
async function saveRedis(
  key: string,
  raw: string,
  next: unknown,
  summary?: { key: string; raw: string; next: unknown },
) {
  const result = await redis.eval(
    CAS,
    summary ? 2 : 1,
    key,
    ...(summary ? [summary.key] : []),
    raw,
    JSON.stringify(next),
    ...(summary ? [summary.raw, JSON.stringify(summary.next)] : []),
  );
  if (result !== 1) throw new Error('战斗状态已变化，请刷新后重试');
}

/** Only active, owned PvE records are considered; training, PvP and archives never qualify. */
export async function readLiveRecovery(
  actor: Actor,
  id: string,
): Promise<LiveRecovery | undefined> {
  const owner = actor.cultivatorId;
  for (const mode of ['runtime', 'sect-task', 'breakthrough'] as const) {
    const key = `combat:v6:${mode}:${id}`,
      raw = await redis.get(key);
    if (!raw) continue;
    const runtime = JSON.parse(raw) as Runtime;
    if (
      runtime.cultivatorId !== owner ||
      runtime.userId !== actor.userId ||
      runtime.battleId !== id
    )
      return;
    let summary:
      | {
          key: string;
          raw: string;
          next: { revision: number; final: { hp: number; mp: number } };
        }
      | undefined;
    if (mode === 'runtime') {
      if (
        runtime.metadata?.sourceType !== 'wild-encounter' ||
        !runtime.host ||
        Date.parse(runtime.expiresAt ?? '') <= Date.now()
      )
        return;
      if ((await redis.get(`combat:v6:active:${owner}`)) !== id) return;
      const summaryKey = `combat:v6:wild:summary:${id}`,
        summaryRaw = await redis.get(summaryKey);
      if (
        !summaryRaw ||
        (await redis.exists(`combat:v6:outbox:terminal:${id}`))
      )
        return;
      summary = {
        key: summaryKey,
        raw: summaryRaw,
        next: JSON.parse(summaryRaw),
      };
    } else if (mode === 'sect-task') {
      const record = await activeSectTaskBattle(owner);
      if (
        !record ||
        SectTaskRecordPayloadSchema.parse(record.payload).executorData
          .activeBattleId !== id
      )
        return;
    } else {
      const record = await activeBreakthroughBattle(owner);
      if (
        !record ||
        (record.metadata as TaskInstanceMetadata).breakthroughBattle
          ?.battleId !== id
      )
        return;
    }
    const snapshot = runtime.host ?? runtime.snapshot;
    if (!snapshot?.playerId) return;
    return {
      snapshot,
      save: async () => {
        runtime.revision++;
        if (mode === 'runtime')
          runtime.latestEventSeq = snapshot.events.length - 1;
        if (summary) {
          const unit = snapshot.state.units.find(
            (u) => u.id === snapshot.playerId,
          )!;
          summary.next.revision = runtime.revision;
          summary.next.final.hp = unit.attrs.hp;
          summary.next.final.mp = unit.attrs.mp;
        }
        await saveRedis(key, raw, runtime, summary);
      },
    };
  }
  const towerKey = towerRunKey(owner),
    towerRaw = await redis.get(towerKey);
  if (towerRaw) {
    const run = JSON.parse(towerRaw) as TowerRun,
      battle = run.battle;
    if (
      battle?.id === id &&
      !battle.settled &&
      Date.parse(run.season.seasonEndsAt) > Date.now()
    )
      return {
        snapshot: battle.snapshot,
        save: async () => {
          battle.revision++;
          await saveRedis(towerKey, towerRaw, run);
        },
      };
  }
  const [run] = await db
    .select()
    .from(dungeonRuns)
    .where(
      and(
        eq(dungeonRuns.cultivatorId, owner),
        eq(dungeonRuns.activeBattleId, id),
        ne(dungeonRuns.status, 'FINISHED'),
      ),
    )
    .limit(1);
  const payload = run?.battlePayload as DungeonBattlePayload | undefined;
  if (
    !run ||
    !payload ||
    payload.settled ||
    payload.snapshot?.version !== 'dungeon-v6-v1'
  )
    return;
  const expected = JSON.stringify(run.battlePayload);
  return {
    snapshot: payload.snapshot,
    save: async (tx) => {
      payload.revision++;
      const changed = await tx
        .update(dungeonRuns)
        .set({ battlePayload: payload })
        .where(
          and(
            eq(dungeonRuns.id, run.id),
            eq(dungeonRuns.cultivatorId, owner),
            eq(dungeonRuns.activeBattleId, id),
            sql`${dungeonRuns.battlePayload} = ${expected}::jsonb`,
          ),
        )
        .returning({ id: dungeonRuns.id });
      if (!changed.length) throw new Error('战斗状态已变化，请刷新后重试');
    },
  };
}

export async function applyLiveRecovery(
  live: LiveRecovery,
  ticketId: string,
  tx: DbTransaction,
) {
  if (recoverCombat(live.snapshot, ticketId)) await live.save(tx);
  const unit = live.snapshot.state.units.find(
    (u) => u.id === live.snapshot.playerId,
  )!;
  return { hp: unit.attrs.hp, mp: unit.attrs.mp };
}
