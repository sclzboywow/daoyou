import { db, type DbTransaction } from '@server/lib/drizzle/db';
import {
  combatReplayArchives,
  combatReplayParticipants,
  cultivators,
  rewardedAdTickets,
} from '@server/lib/drizzle/schema';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import {
  REWARDED_AD_UNITS,
  type RewardedAdStatus,
  type RewardedAdTicket,
} from '@shared/contracts/rewardedAds';
import {
  isRewardedDefeat,
  rewardedRecovery,
} from '@shared/rewards/rewardedAds';
import { and, desc, eq, gt, isNotNull, isNull, or } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { playerCommandExecutor } from './CommandExecutors';
import { ConditionService } from './ConditionService';
import { assertCombatV6MutationAllowed } from './combat-v6/CombatV6MutationGuard';
import { loadPlayerInnRecoveryFacts } from './cultivator/CultivatorConditionFactsReader';

import { canRecoverCombat } from '@shared/rewards/combatRecovery';
import {
  applyLiveRecovery,
  readLiveRecovery,
} from './combat-v6/CombatAdRecovery';

type Actor = { userId: string; cultivatorId: string };
export class RewardedAdError extends Error {
  readonly status = 409;
}
export const rewardedAdsEnabled = () =>
  process.env.WECHAT_REWARDED_ADS_ENABLED === 'true' &&
  !!(
    process.env.WECHAT_AD_REWARD_CALLBACK_TOKEN ??
    process.env.WECHAT_REWARDED_AD_TOKEN
  ) &&
  /^[A-Za-z0-9+/]{43}$/.test(
    process.env.WECHAT_AD_REWARD_CALLBACK_AES_KEY ??
      process.env.WECHAT_REWARDED_AD_AES_KEY ??
      '',
  );
function requireEnabled() {
  if (!rewardedAdsEnabled()) throw new RewardedAdError('广告奖励暂未开放');
}
async function facts(actor: Actor, q: typeof db | DbTransaction = db) {
  const [row] = await q
    .select({ lastYieldAt: cultivators.last_yield_at })
    .from(cultivators)
    .where(
      and(
        eq(cultivators.id, actor.cultivatorId),
        eq(cultivators.userId, actor.userId),
        eq(cultivators.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) throw new RewardedAdError('角色不存在');
  return row;
}
async function latestBattle(actor: Actor, q: typeof db | DbTransaction = db) {
  const [battle] = await q
    .select({
      id: combatReplayArchives.battleId,
      outcome: combatReplayArchives.outcome,
      side: combatReplayParticipants.side,
      source: combatReplayArchives.sourceType,
    })
    .from(combatReplayParticipants)
    .innerJoin(
      combatReplayArchives,
      eq(combatReplayArchives.battleId, combatReplayParticipants.battleId),
    )
    .where(eq(combatReplayParticipants.cultivatorId, actor.cultivatorId))
    .orderBy(
      desc(combatReplayArchives.finishedAt),
      desc(combatReplayArchives.battleId),
    )
    .limit(1);
  return battle && isRewardedDefeat(battle.outcome, battle.side, battle.source)
    ? battle
    : undefined;
}
async function recoveryFacts(actor: Actor, q: typeof db | DbTransaction = db) {
  const character = await loadPlayerInnRecoveryFacts(
    actor.userId,
    actor.cultivatorId,
    q,
  );
  if (!character) throw new RewardedAdError('角色不存在');
  const condition = ConditionService.normalizeCondition(
    character,
    character.condition,
  );
  const maximum = ConditionService.getMaxResources(character, condition);
  const resources = rewardedRecovery(
    { hp: condition.resources.hp.current, mp: condition.resources.mp.current },
    maximum,
  );
  return {
    condition,
    maximum,
    resources,
    available:
      resources.hp > condition.resources.hp.current ||
      resources.mp > condition.resources.mp.current,
  };
}
export async function readRewardedAdStatus(
  actor: Actor,
  battleId?: string,
): Promise<RewardedAdStatus> {
  const empty = {
    enabled: false,
    yieldAvailable: false,
    recoveryAvailable: false,
    recoveryBattleId: null,
  };
  if (!rewardedAdsEnabled()) return empty;
  const player = await facts(actor);
  if (battleId) {
    const live = await readLiveRecovery(actor, battleId);
    return {
      enabled: true,
      yieldAvailable: false,
      recoveryAvailable: !!live && canRecoverCombat(live.snapshot),
      recoveryBattleId: battleId,
      recoveryMode: 'combat',
    };
  }
  const battle = await latestBattle(actor);
  let recoveryAvailable = false;
  if (battle) {
    const [receipt] = await db
      .select({ consumedAt: rewardedAdTickets.consumedAt })
      .from(rewardedAdTickets)
      .where(
        and(
          eq(rewardedAdTickets.cultivatorId, actor.cultivatorId),
          eq(rewardedAdTickets.placement, 'recovery'),
          eq(rewardedAdTickets.targetKey, battle.id),
        ),
      )
      .limit(1);
    recoveryAvailable =
      !receipt?.consumedAt && (await recoveryFacts(actor)).available;
  }
  return {
    enabled: true,
    yieldAvailable:
      !!player.lastYieldAt &&
      Date.now() - player.lastYieldAt.getTime() >= 3600000,
    recoveryAvailable,
    recoveryBattleId: recoveryAvailable ? battle!.id : null,
  };
}
export async function prepareRewardedAd(
  actor: Actor,
  placement: 'yield' | 'recovery',
  battleId?: string,
): Promise<RewardedAdTicket> {
  requireEnabled();
  return withRedisLock(
    {
      key: redisLockKeys.cultivatorMutation(actor.cultivatorId),
      context: 'rewarded-ad-prepare',
      timeoutMs: 30000,
      retries: 0,
    },
    async (lease) => {
      if (!battleId)
        await assertCombatV6MutationAllowed(
          actor.cultivatorId,
          'rewarded_ad_recovery',
        );
      const player = await facts(actor);
      let targetKey: string;
      if (placement === 'yield') {
        if (
          !player.lastYieldAt ||
          Date.now() - player.lastYieldAt.getTime() < 3600000
        )
          throw new RewardedAdError('历练不足一小时，暂不可领取');
        targetKey = player.lastYieldAt.toISOString();
      } else if (battleId) {
        const live = await readLiveRecovery(actor, battleId);
        if (!live || !canRecoverCombat(live.snapshot))
          throw new RewardedAdError('当前战斗不符合恢复条件');
        targetKey = 'live:' + battleId;
      } else {
        const battle = await latestBattle(actor);
        if (!battle || !(await recoveryFacts(actor)).available)
          throw new RewardedAdError('当前没有可恢复的战败状态');
        targetKey = battle.id;
      }
      return db.transaction(async (tx) => {
        const [existing] = await tx
          .select()
          .from(rewardedAdTickets)
          .where(
            and(
              eq(rewardedAdTickets.cultivatorId, actor.cultivatorId),
              eq(rewardedAdTickets.placement, placement),
              eq(rewardedAdTickets.targetKey, targetKey),
            ),
          )
          .limit(1);
        if (existing?.consumedAt)
          throw new RewardedAdError('这份广告奖励已领取');
        if (existing && existing.expiresAt.getTime() > Date.now())
          return {
            verification: verificationData(actor, placement, existing.id),
            ticketId: existing.id,
            placement,
            adUnitId: REWARDED_AD_UNITS[placement],
            expiresAt: existing.expiresAt.toISOString(),
          };
        const id = randomUUID(),
          expiresAt = new Date(Date.now() + 15 * 60000);
        if (existing)
          await tx
            .delete(rewardedAdTickets)
            .where(eq(rewardedAdTickets.id, existing.id));
        await tx
          .insert(rewardedAdTickets)
          .values({ id, ...actor, placement, targetKey, expiresAt });
        lease.assertHeld();
        return {
          verification: verificationData(actor, placement, id),
          ticketId: id,
          placement,
          adUnitId: REWARDED_AD_UNITS[placement],
          expiresAt: expiresAt.toISOString(),
        };
      });
    },
  );
}
/** Atomically marks one actor-bound ticket consumed in the same transaction as its reward. */
export async function consumeRewardedAd(
  tx: DbTransaction,
  actor: Actor,
  id: string,
  placement: 'yield' | 'recovery',
  targetKey: string,
) {
  requireEnabled();
  const [receipt] = await tx
    .update(rewardedAdTickets)
    .set({ consumedAt: new Date() })
    .where(
      and(
        eq(rewardedAdTickets.id, id),
        eq(rewardedAdTickets.userId, actor.userId),
        eq(rewardedAdTickets.cultivatorId, actor.cultivatorId),
        eq(rewardedAdTickets.placement, placement),
        eq(rewardedAdTickets.targetKey, targetKey),
        isNull(rewardedAdTickets.consumedAt),
        isNotNull(rewardedAdTickets.verifiedAt),
        gt(rewardedAdTickets.expiresAt, new Date()),
      ),
    )
    .returning({ id: rewardedAdTickets.id });
  if (!receipt)
    throw new RewardedAdError('广告奖励凭证已失效或已领取，请重新读取');
}
export async function claimRewardedRecovery(actor: Actor, ticketId: string) {
  requireEnabled();
  const [ticket] = await db
    .select()
    .from(rewardedAdTickets)
    .where(
      and(
        eq(rewardedAdTickets.id, ticketId),
        eq(rewardedAdTickets.userId, actor.userId),
        eq(rewardedAdTickets.cultivatorId, actor.cultivatorId),
        eq(rewardedAdTickets.placement, 'recovery'),
      ),
    )
    .limit(1);
  if (ticket?.targetKey.startsWith('live:')) {
    const battleId = ticket.targetKey.slice(5);
    return withRedisLock(
      {
        key: redisLockKeys.cultivatorMutation(actor.cultivatorId),
        context: 'combat-ad-recovery',
        timeoutMs: 30000,
        retries: 0,
      },
      async (lease) =>
        db.transaction(async (tx) => {
          await facts(actor, tx);
          const [proof] = await tx
            .select()
            .from(rewardedAdTickets)
            .where(eq(rewardedAdTickets.id, ticketId))
            .for('update');
          if (!proof?.verifiedAt)
            throw new RewardedAdError('微信尚未确认视频奖励');
          if (proof.consumedAt)
            return {
              result: { battleId, combatRecovery: true },
              state: { changes: [], baselines: [] },
            };
          if (proof.expiresAt.getTime() <= Date.now())
            throw new RewardedAdError('广告奖励凭证已过期');
          const live = await readLiveRecovery(actor, battleId);
          if (!live) throw new RewardedAdError('战斗已结束，无法在本场恢复');
          lease.assertHeld();
          // Redis snapshots carry the ticket receipt in the same CAS as HP/MP.
          // A DB rollback can safely retry that CAS without a second recovery.
          let resources;
          try {
            resources = await applyLiveRecovery(live, ticketId, tx);
          } catch (error) {
            throw new RewardedAdError(
              error instanceof Error ? error.message : '战斗恢复失败',
            );
          }
          await consumeRewardedAd(
            tx,
            actor,
            ticketId,
            'recovery',
            proof.targetKey,
          );
          lease.assertHeld();
          return {
            result: { battleId, combatRecovery: true, ...resources },
            state: { changes: [], baselines: [] },
          };
        }),
    );
  }
  return playerCommandExecutor.executeWithLock({
    ...actor,
    source: 'rewarded_ad_recovery',
    idempotency: { key: ticketId, fingerprint: ticketId },
    command: async (tx) => {
      await facts(actor, tx);
      const battle = await latestBattle(actor, tx);
      if (!battle) throw new RewardedAdError('当前没有可恢复的战败状态');
      const state = await recoveryFacts(actor, tx);
      if (!state.available)
        throw new RewardedAdError('当前气血与法力已达到一半');
      await consumeRewardedAd(tx, actor, ticketId, 'recovery', battle.id);
      const condition = {
        ...state.condition,
        resources: {
          hp: { current: state.resources.hp, max: state.maximum.maxHp },
          mp: { current: state.resources.mp, max: state.maximum.maxMp },
        },
        timestamps: {
          ...state.condition.timestamps,
          lastRecoveryAt: new Date().toISOString(),
        },
      };
      await tx
        .update(cultivators)
        .set({ condition })
        .where(eq(cultivators.id, actor.cultivatorId));
      return {
        result: {
          battleId: battle.id,
          hp: state.resources.hp,
          mp: state.resources.mp,
        },
        resourceChanges: [
          {
            resourceTopic: 'player.condition' as const,
            operation: 'invalidate' as const,
            eventType: 'condition.rewarded_ad.recovered',
          },
        ],
      };
    },
  });
}

function verificationData(
  actor: Actor,
  placement: 'yield' | 'recovery',
  ticketId: string,
) {
  return {
    userId: actor.userId,
    rewardItem: REWARDED_AD_UNITS[placement],
    rewardAmount: 1,
    customData: ticketId,
  };
}
export async function readRewardedAdTicket(actor: Actor, ticketId: string) {
  const [ticket] = await db
    .select({
      verifiedAt: rewardedAdTickets.verifiedAt,
      consumedAt: rewardedAdTickets.consumedAt,
      expiresAt: rewardedAdTickets.expiresAt,
    })
    .from(rewardedAdTickets)
    .where(
      and(
        eq(rewardedAdTickets.id, ticketId),
        eq(rewardedAdTickets.userId, actor.userId),
        eq(rewardedAdTickets.cultivatorId, actor.cultivatorId),
      ),
    )
    .limit(1);
  if (!ticket) throw new RewardedAdError('广告奖励凭证不存在');
  return {
    verified: !!ticket.verifiedAt,
    consumed: !!ticket.consumedAt,
    expired: ticket.expiresAt.getTime() <= Date.now(),
  };
}
/** Authenticated WeChat callback only verifies a ticket. Resource writes remain in the claim transaction. */
export async function verifyRewardedAdTicket(
  event: {
    transaction_id: string;
    user_id: string;
    reward_item: string;
    reward_amount: number;
    custom_data: string;
  },
  rewardedAt: number,
) {
  if (!rewardedAdsEnabled()) return false;
  const [ticket] = await db
    .select()
    .from(rewardedAdTickets)
    .where(
      and(
        eq(rewardedAdTickets.id, event.custom_data),
        eq(rewardedAdTickets.userId, event.user_id),
      ),
    )
    .limit(1);
  if (
    !ticket ||
    event.reward_item !==
      REWARDED_AD_UNITS[ticket.placement as 'yield' | 'recovery'] ||
    event.reward_amount !== 1 ||
    rewardedAt < ticket.createdAt.getTime() - 60000
  )
    return false;
  if (ticket.transactionId)
    return ticket.transactionId === event.transaction_id;
  if (ticket.expiresAt.getTime() <= Date.now() || ticket.consumedAt)
    return false;
  const rows = await db
    .update(rewardedAdTickets)
    .set({ verifiedAt: new Date(), transactionId: event.transaction_id })
    .where(
      and(
        eq(rewardedAdTickets.id, ticket.id),
        isNull(rewardedAdTickets.consumedAt),
        gt(rewardedAdTickets.expiresAt, new Date()),
        or(
          isNull(rewardedAdTickets.transactionId),
          eq(rewardedAdTickets.transactionId, event.transaction_id),
        ),
      ),
    )
    .returning({ id: rewardedAdTickets.id });
  return rows.length === 1;
}
