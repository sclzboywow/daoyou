import { describeJournal } from './JournalSettlement';
import { cultivators } from '@server/lib/drizzle/schema';
import { createDomainEvent } from '@server/lib/mq/domainEventWriter';
import { publishTransactionalMessageBestEffort } from '@server/lib/mq/transactionalMessagePublisher';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import { findPlayerMutationRequest } from '@server/lib/repositories/playerStateRepository';
import {
  updateCultivationExp,
  updateSpiritStones,
} from '@server/lib/services/cultivator/CultivatorStateRepository';
import { getOrInitCultivationProgress } from '@server/utils/cultivationUtils';
import { MailInventoryGrantSchema } from '@shared/contracts/mail';
import type { GeneratedMaterial } from '@shared/engine/material/creation/types';
import { YieldCalculator } from '@shared/engine/yield/YieldCalculator';
import { rewardedYieldSnapshot } from '@shared/rewards/rewardedAds';
import { planYieldRewards } from '@shared/rewards/yield';
import type { RealmStage, RealmType } from '@shared/types/constants';
import type { CultivationProgress } from '@shared/types/cultivator';
import { and, eq } from 'drizzle-orm';
import { getExecutor } from '../drizzle/db';
import { playerCommandExecutor } from './CommandExecutors';
import { computeItemLibrarySampleKey } from './itemLibrarySampleKey';
import { newRewardAttachment } from './MailInventory';
import { consumeRewardedAd } from './RewardedAdApplicationService';
import { generateYieldMaterials } from './YieldDomainEventProjector';

export class YieldCommandError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404,
  ) {
    super(message);
  }
}

interface YieldFacts {
  name: string;
  realm: RealmType;
  realmStage: RealmStage;
  lastYieldAt: Date;
  spiritStones: number;
  progress: CultivationProgress;
}
interface YieldResult {
  cultivatorName: string;
  cultivatorRealm: RealmType;
  amount: number;
  expGain: number;
  insightGain: number;
  materials: GeneratedMaterial[];
  hours: number;
  materialCount: number;
  rewardCount: number;
  multiplier: 1 | 2;
}

async function loadYieldFacts(
  userId: string,
  cultivatorId: string,
): Promise<YieldFacts | null> {
  const [row] = await getExecutor()
    .select({
      name: cultivators.name,
      realm: cultivators.realm,
      realmStage: cultivators.realm_stage,
      lastYieldAt: cultivators.last_yield_at,
      spiritStones: cultivators.spirit_stones,
      progress: cultivators.cultivation_progress,
    })
    .from(cultivators)
    .where(
      and(
        eq(cultivators.id, cultivatorId),
        eq(cultivators.userId, userId),
        eq(cultivators.status, 'active'),
      ),
    )
    .limit(1);
  if (!row) return null;
  const realm = row.realm as RealmType;
  const realmStage = row.realmStage as RealmStage;
  return {
    name: row.name,
    realm,
    realmStage,
    lastYieldAt: row.lastYieldAt ?? new Date(),
    spiritStones: row.spiritStones,
    progress: getOrInitCultivationProgress(
      (row.progress ?? {}) as CultivationProgress,
      realm,
      realmStage,
    ),
  };
}

interface YieldResult {
  cultivatorName: string;
  cultivatorRealm: RealmType;
  amount: number;
  expGain: number;
  insightGain: number;
  materials: GeneratedMaterial[];
  hours: number;
  materialCount: number;
  rewardCount: number;
}

export async function executeYieldCommand(args: {
  userId: string;
  cultivatorId: string;
  adTicketId?: string;
  requestId: string;
}) {
  const actionInstanceId = args.requestId;
  const idempotency = args.adTicketId ? { key: args.adTicketId, fingerprint: args.adTicketId } : { key: args.requestId, fingerprint: 'yield' };
  let domainEventId: string | undefined;
  const prepared = await withRedisLock(
    {
      key: redisLockKeys.cultivatorMutation(args.cultivatorId),
      context: 'yield',
      timeoutMs: 120_000,
      retries: 0,
      delayMs: 50,
    },
    async (lease) => {
      if (await findPlayerMutationRequest(args.cultivatorId, 'yield_claim', idempotency.key)) {
        const committed = await playerCommandExecutor.execute<YieldResult>({
          coordination: { mode: 'redis', lease },
          userId: args.userId, cultivatorId: args.cultivatorId,
          source: 'yield_claim', idempotency,
          command: async () => { throw new Error('历练执行凭据已失效'); },
        });
        return { committed, result: committed.result };
      }
      const facts = await loadYieldFacts(args.userId, args.cultivatorId);
      if (!facts) {
        throw new YieldCommandError('未找到角色信息', 404);
      }
      const hoursElapsed = Math.min(
        (Date.now() - facts.lastYieldAt.getTime()) / (1000 * 60 * 60),
        24,
      );
      if (hoursElapsed < 1) {
        throw new YieldCommandError(
          '历练时日尚短（不足一小时），难有机缘。',
          400,
        );
      }
      const multiplier: 1 | 2 = args.adTicketId ? 2 : 1;
      const baseOperations = YieldCalculator.calculateCultivatorYield({
        realm: facts.realm,
        realmStage: facts.realmStage,
        hoursElapsed,
      });
      const rewardPlan = planYieldRewards(
        {
          realm: facts.realm,
          realmStage: facts.realmStage,
          hoursElapsed,
        },
        (stream) => {
          let index = 0;
          return () =>
            computeItemLibrarySampleKey(
              `${actionInstanceId}:${stream}:${index++}`,
            );
        },
      );
      const materials = await generateYieldMaterials(
        facts.realm,
        rewardPlan.materialCount,
        actionInstanceId,
        true,
      );
      const baseRewardItems = [
        ...materials.map((attachment) =>
          MailInventoryGrantSchema.parse(
            newRewardAttachment(attachment).inventory,
          ),
        ),
        ...rewardPlan.items,
      ];
      const { operations, items: rewardItems } = rewardedYieldSnapshot(
        baseOperations,
        baseRewardItems,
        multiplier,
      );
      const result: YieldResult = {
        cultivatorName: facts.name,
        cultivatorRealm: facts.realm,
        amount:
          operations.find((operation) => operation.type === 'spirit_stones')
            ?.value ?? 0,
        expGain:
          operations.find((operation) => operation.type === 'cultivation_exp')
            ?.value ?? 0,
        insightGain:
          operations.find(
            (operation) => operation.type === 'comprehension_insight',
          )?.value ?? 0,
        materials: [] as GeneratedMaterial[],
        hours: hoursElapsed,
        materialCount: rewardPlan.materialCount * multiplier,
        rewardCount: rewardPlan.count * multiplier,
        multiplier,
      };
      const committed = await playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: args.userId,
        cultivatorId: args.cultivatorId,
        source: 'yield_claim',
        requestId: actionInstanceId,
        idempotency,
        command: async (tx) => {
          describeJournal(tx, args.cultivatorId, `${Number(hoursElapsed.toFixed(1))}小时`);
          if (args.adTicketId)
            await consumeRewardedAd(
              tx,
              args,
              args.adTicketId,
              'yield',
              facts.lastYieldAt.toISOString(),
            );
          let spiritStones = facts.spiritStones;
          let progress = facts.progress;
          const claimedAt = new Date();
          for (const gain of operations) {
            switch (gain.type) {
              case 'spirit_stones':
                spiritStones = await updateSpiritStones(
                  args.userId,
                  args.cultivatorId,
                  gain.value,
                  tx,
                );
                break;
              case 'cultivation_exp':
                progress = await updateCultivationExp(
                  args.userId,
                  args.cultivatorId,
                  gain.value,
                  undefined,
                  tx,
                );
                break;
              case 'comprehension_insight':
                progress = await updateCultivationExp(
                  args.userId,
                  args.cultivatorId,
                  0,
                  gain.value,
                  tx,
                );
                break;
              case 'material':
                break;
              default:
                throw new Error(`未知的资源类型: ${gain.type}`);
            }
          }
          await tx
            .update(cultivators)
            .set({ last_yield_at: claimedAt })
            .where(eq(cultivators.id, args.cultivatorId));
          if (rewardPlan.count > 0) {
            domainEventId = (
              await createDomainEvent(
                {
                  type: 'yield.claimed',
                  aggregate: { type: 'cultivator', id: args.cultivatorId },
                  data: {
                    cultivatorId: args.cultivatorId,
                    actionInstanceId,
                    realm: facts.realm,
                    materialCount: rewardPlan.count * multiplier,
                    rewardSnapshot: {
                      poolId: rewardPlan.poolId,
                      poolVersion: rewardPlan.poolVersion,
                      items: rewardItems,
                    },
                  },
                  deduplicationKey: `${args.cultivatorId}:yield:${actionInstanceId}`,
                },
                tx,
              )
            ).id;
          }
          return {
            result,
            resourceChanges: [
              {
                resourceTopic: 'player.currency',
                eventType: 'currency.yield.claimed',
                operation: 'merge',
                payload: {
                  spiritStones,
                },
              },
              {
                resourceTopic: 'player.progress',
                eventType: 'progress.yield.claimed',
                operation: 'replace',
                payload: progress,
              },
              {
                resourceTopic: 'player.profile',
                eventType: 'profile.yield.claimed',
                operation: 'merge',
                payload: {
                  cultivator: { last_yield_at: claimedAt.toISOString() },
                },
              },
            ],
          };
        },
      });
      return { committed, result };
    },
  );
  publishTransactionalMessageBestEffort(domainEventId, {
    source: 'yield_claim',
    cultivatorId: args.cultivatorId,
  });
  return prepared;
}
