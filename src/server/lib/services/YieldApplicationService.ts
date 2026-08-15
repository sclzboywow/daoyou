import { cultivators } from '@server/lib/drizzle/schema';
import { runDetached } from '@server/lib/http/response';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import {
  updateCultivationExp,
  updateSpiritStones,
} from '@server/lib/services/cultivator/CultivatorStateRepository';
import { getOrInitCultivationProgress } from '@server/utils/cultivationUtils';
import { MaterialGenerator } from '@shared/engine/material/creation/MaterialGenerator';
import type { GeneratedMaterial } from '@shared/engine/material/creation/types';
import { YieldCalculator } from '@shared/engine/yield/YieldCalculator';
import type { RealmStage, RealmType } from '@shared/types/constants';
import type { CultivationProgress } from '@shared/types/cultivator';
import { and, eq } from 'drizzle-orm';
import { getExecutor } from '../drizzle/db';
import { playerCommandExecutor } from './CommandExecutors';
import { MailService, type MailAttachment } from './MailService';
import { readPlayerMailSummary } from './PlayerResourceReaderService';
import { normalizeGeneratedSeed } from './SpiritSeedService';

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

export async function executeYieldCommand(args: {
  userId: string;
  cultivatorId: string;
}) {
  const prepared = await withRedisLock(
    {
      key: redisLockKeys.cultivatorMutation(args.cultivatorId),
      context: 'yield',
      timeoutMs: 120_000,
      retries: 0,
      delayMs: 50,
    },
    async (lease) => {
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
      const operations = YieldCalculator.calculateCultivatorYield({
        realm: facts.realm,
        realmStage: facts.realmStage,
        hoursElapsed,
      });
      const materialCount =
        YieldCalculator.calculateMaterialCount(hoursElapsed);
      const result = {
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
        materialCount,
      };
      const committed = await playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: args.userId,
        cultivatorId: args.cultivatorId,
        source: 'yield_claim',
        command: async (tx) => {
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
      return { committed, result, realm: facts.realm, materialCount };
    },
  );

  if (prepared.materialCount > 0) {
    runDetached(() =>
      generateAndSendYieldMaterials({
        userId: args.userId,
        cultivatorId: args.cultivatorId,
        realm: prepared.realm,
        materialCount: prepared.materialCount,
      }),
    );
  }
  return prepared;
}

async function generateAndSendYieldMaterials(args: {
  userId: string;
  cultivatorId: string;
  realm: RealmType;
  materialCount: number;
}): Promise<void> {
  let materials: GeneratedMaterial[];
  try {
    materials = (
      await MaterialGenerator.generateRandom(args.materialCount, {
        qualityChanceMap: YieldCalculator.getMaterialQualityChanceMap(
          args.realm,
        ),
      })
    ).map((material) => normalizeGeneratedSeed(material, 'daily_yield'));
  } catch (error) {
    console.error('[Yield] 材料生成异常:', error);
    materials = [];
  }
  if (materials.length === 0) return;
  const attachments: MailAttachment[] = materials.map((material) => ({
    type: 'material',
    name: material.name,
    quantity: material.quantity,
    data: material,
  }));
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await playerCommandExecutor.executeWithLock({
        userId: args.userId,
        cultivatorId: args.cultivatorId,
        source: 'yield_material_mail',
        command: async (tx) => {
          await MailService.sendMail(
            args.cultivatorId,
            '历练机缘',
            '道友历练途中，偶得天材地宝，特以此传音玉简送达。',
            attachments,
            'reward',
            tx,
          );
          const summary = await readPlayerMailSummary(args.cultivatorId, tx);
          return {
            result: null,
            resourceChanges: [
              {
                resourceTopic: 'player.mail-summary',
                eventType: 'mail.yield_material.created',
                operation: 'replace',
                payload: summary,
              },
            ],
          };
        },
      });
      return;
    } catch (error) {
      if (attempt === 3) {
        console.error('[Yield] 材料奖励邮件发送失败:', error);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
    }
  }
}
