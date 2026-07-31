import { getExecutor } from '@server/lib/drizzle/db';
import {
  consumables,
  creationProducts,
  cultivators,
} from '@server/lib/drizzle/schema';
import { requireActiveCultivatorRef } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  checkDailyChallenges,
  getCultivatorRank,
  getRankingList,
  getRemainingChallenges,
  isLocked,
  isRankingEmpty,
} from '@server/lib/redis/rankings';
import {
  loadCultivatorInspectionData,
} from '@server/lib/services/cultivator/CultivatorCombatProjectionReader';
import {
  RankingCommandError,
  runRankingBattleCommand,
} from '@server/lib/services/RankingApplicationService';
import { projectAbilityConfig } from '@shared/engine/creation-v2/models/AbilityProjection';
import { rehydrateStoredProductModel } from '@shared/engine/creation-v2/persistence/ProductPersistenceMapper';
import {
  getConsumableTypeLabel,
  getCreationProductTypeLabel,
  getEquipmentSlotLabel,
} from '@shared/lib/gameConceptDisplay';
import {
  EquipmentSlot,
  QUALITY_VALUES,
  REALM_VALUES,
  type ElementType,
  type RealmType,
} from '@shared/types/constants';
import type {
  ItemRankingEntry,
  WealthRankingEntry,
} from '@shared/types/rankings';
import { and, desc, eq, inArray, isNotNull } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';
import { readCultivatorRealm } from '@server/lib/services/cultivator/CultivatorFactsReader';

const ChallengeSchema = z.object({
  targetId: z.string().optional().nullable(),
  realm: z.enum(REALM_VALUES).optional(),
});

const ChallengeBattleSchema = z.object({
  targetId: z.string().optional().nullable(),
  realm: z.enum(REALM_VALUES).optional(),
});

const router = new Hono<AppEnv>();
const publicRouter = new Hono<AppEnv>();
const challengeRouter = new Hono<AppEnv>();

function getRehydratedProductModel(
  productModel: unknown,
  element?: string | null,
) {
  return rehydrateStoredProductModel(
    (productModel ?? null) as Record<string, unknown> | null,
    (element as ElementType | null) ?? undefined,
  );
}

function parseRealmQuery(raw: string | undefined | null): RealmType | null {
  if (!raw) return null;
  return REALM_VALUES.includes(raw as RealmType) ? (raw as RealmType) : null;
}

publicRouter.get('/', async (c) => {
  try {
    const realm = parseRealmQuery(c.req.query('realm')) ?? '炼气';
    const rankings = await getRankingList(realm);
    return c.json({
      success: true,
      data: rankings,
      realm,
    });
  } catch (error) {
    console.error('获取排行榜 API 错误:', error);
    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : '获取排行榜失败，请稍后重试'
        : '获取排行榜失败，请稍后重试';

    return c.json({ error: errorMessage }, 500);
  }
});

publicRouter.get('/items', async (c) => {
  try {
    const type = c.req.query('type');
    if (!type || !['artifact', 'skill', 'elixir', 'technique'].includes(type)) {
      return c.json({ success: false, error: '无效的榜单类型' }, 400);
    }

    let items: ItemRankingEntry[] = [];
    const limit = 100;
    const validQualities = QUALITY_VALUES.slice(2);
    const validProductQualities = QUALITY_VALUES.slice(2);

    if (type === 'artifact') {
      const rows = await getExecutor()
        .select({ item: creationProducts, owner: cultivators })
        .from(creationProducts)
        .leftJoin(
          cultivators,
          eq(creationProducts.cultivatorId, cultivators.id),
        )
        .where(
          and(
            isNotNull(creationProducts.cultivatorId),
            eq(creationProducts.productType, 'artifact'),
            inArray(creationProducts.quality, validQualities as string[]),
          ),
        )
        .orderBy(desc(creationProducts.score))
        .limit(limit);

      items = rows.map(({ item, owner }, index) => {
        const productModel =
          getRehydratedProductModel(item.productModel, item.element) ??
          item.productModel ??
          undefined;

        return {
          id: item.id,
          rank: index + 1,
          name: item.name,
          itemType: 'artifact',
          type: getEquipmentSlotLabel(item.slot as EquipmentSlot),
          quality: item.quality ?? undefined,
          ownerName: owner?.name || '未知',
          score: item.score || 0,
          description: item.description || '',
          title: item.quality ?? undefined,
          element: item.element ?? undefined,
          slot: item.slot ?? undefined,
          productModel,
        };
      });
    } else if (type === 'skill') {
      const rows = await getExecutor()
        .select({ item: creationProducts, owner: cultivators })
        .from(creationProducts)
        .leftJoin(
          cultivators,
          eq(creationProducts.cultivatorId, cultivators.id),
        )
        .where(
          and(
            isNotNull(creationProducts.cultivatorId),
            eq(creationProducts.productType, 'skill'),
            inArray(
              creationProducts.quality,
              validProductQualities as string[],
            ),
          ),
        )
        .orderBy(desc(creationProducts.score))
        .limit(limit);

      items = rows.map(({ item, owner }, index) => {
        let cooldown = 0;
        let cost = 0;
        const productModel = getRehydratedProductModel(
          item.productModel,
          item.element,
        );

        if (productModel) {
          try {
            const abilityConfig = projectAbilityConfig(productModel);
            cooldown = abilityConfig.cooldown ?? 0;
            cost = abilityConfig.mpCost || 0;
          } catch {
            // fallback to defaults
          }
        }

        return {
          id: item.id,
          rank: index + 1,
          name: item.name,
          itemType: 'skill',
          type: item.element
            ? `${item.element}系${getCreationProductTypeLabel('skill')}`
            : getCreationProductTypeLabel('skill'),
          quality: (item.quality as string | undefined) || undefined,
          ownerName: owner?.name || '未知',
          score: item.score || 0,
          description: item.description || '',
          title: item.quality || '未知品阶',
          element: item.element ?? undefined,
          cooldown,
          cost,
          productModel: productModel ?? item.productModel ?? undefined,
        };
      });
    } else if (type === 'elixir') {
      const rows = await getExecutor()
        .select({ item: consumables, owner: cultivators })
        .from(consumables)
        .leftJoin(cultivators, eq(consumables.cultivatorId, cultivators.id))
        .where(
          and(
            isNotNull(consumables.cultivatorId),
            eq(consumables.type, '丹药'),
            inArray(consumables.quality, validQualities as string[]),
          ),
        )
        .orderBy(desc(consumables.score))
        .limit(limit);

      items = rows.map(({ item, owner }, index) => ({
        id: item.id,
        rank: index + 1,
        name: item.name,
        itemType: 'elixir',
        type: getConsumableTypeLabel('丹药'),
        quality: item.quality ?? undefined,
        ownerName: owner?.name || '未知',
        score: item.score || 0,
        description: item.description || '',
        title: item.quality ?? undefined,
        quantity: item.quantity,
        spec: item.spec ?? undefined,
      }));
    } else if (type === 'technique') {
      const rows = await getExecutor()
        .select({ item: creationProducts, owner: cultivators })
        .from(creationProducts)
        .leftJoin(
          cultivators,
          eq(creationProducts.cultivatorId, cultivators.id),
        )
        .where(
          and(
            isNotNull(creationProducts.cultivatorId),
            eq(creationProducts.productType, 'gongfa'),
            inArray(
              creationProducts.quality,
              validProductQualities as string[],
            ),
          ),
        )
        .orderBy(desc(creationProducts.score))
        .limit(limit);

      items = rows.map(({ item, owner }, index) => {
        const productModel =
          getRehydratedProductModel(item.productModel, item.element) ??
          item.productModel ??
          undefined;

        return {
          id: item.id,
          rank: index + 1,
          name: item.name,
          itemType: 'technique',
          type: getCreationProductTypeLabel('gongfa'),
          quality: (item.quality as string | undefined) || undefined,
          ownerName: owner?.name || '未知',
          score: item.score || 0,
          description: item.description || '',
          title: item.quality || '未知品阶',
          productModel,
        };
      });
    }

    return c.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error('获取排行榜失败:', error);
    return c.json({ success: false, error: '获取排行榜失败' }, 500);
  }
});

publicRouter.get('/wealth', async (c) => {
  try {
    const limit = 100;
    const rows = await getExecutor()
      .select({
        id: cultivators.id,
        name: cultivators.name,
        title: cultivators.title,
        realm: cultivators.realm,
        realmStage: cultivators.realm_stage,
        age: cultivators.age,
        origin: cultivators.origin,
        spiritStones: cultivators.spirit_stones,
      })
      .from(cultivators)
      .where(eq(cultivators.status, 'active'))
      .orderBy(desc(cultivators.spirit_stones))
      .limit(limit);

    const items: WealthRankingEntry[] = rows.map((row, index) => ({
      id: row.id,
      rank: index + 1,
      rankingType: 'wealth',
      name: row.name,
      title: row.title,
      realm: row.realm,
      realm_stage: row.realmStage,
      age: row.age,
      origin: row.origin,
      spiritStones: row.spiritStones,
    }));

    return c.json({
      success: true,
      data: items,
    });
  } catch (error) {
    console.error('获取财富榜失败:', error);
    return c.json({ success: false, error: '获取财富榜失败' }, 500);
  }
});

challengeRouter.get('/my-rank', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  const own = await readCultivatorRealm(cultivator.cultivatorId);
  const realm = parseRealmQuery(c.req.query('realm')) ?? own.realm;
  const rank = await getCultivatorRank(realm, cultivator.cultivatorId);
  const remainingChallenges = await getRemainingChallenges(cultivator.cultivatorId);

  return c.json({
    success: true,
    data: {
      rank,
      realm,
      remainingChallenges,
    },
  });
});

challengeRouter.post('/probe', requireActiveCultivatorRef(), async (c) => {
  try {
    const { targetId } = (await c.req.json()) as { targetId?: string };
    if (!targetId || typeof targetId !== 'string') {
      return c.json({ error: '请提供有效的目标角色ID' }, 400);
    }

    const inspection = await loadCultivatorInspectionData(targetId);
    if (!inspection) {
      return c.json({ error: '目标角色不存在或不可查探' }, 404);
    }

    return c.json({
      success: true,
      data: { cultivator: inspection },
    });
  } catch (error) {
    console.error('神识查探错误:', error);
    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : '神识查探失败'
        : '神识查探失败，请稍后重试';

    return c.json({ error: errorMessage }, 500);
  }
});

challengeRouter.post('/challenge', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const { targetId, realm: requestedRealm } = ChallengeSchema.parse(
    await c.req.json(),
  );
  const cultivatorId = cultivator.cultivatorId;
  const ownRealm = (await readCultivatorRealm(cultivatorId)).realm;
  const rankingRealm = requestedRealm ?? ownRealm;
  const isOwnRealmRanking = rankingRealm === ownRealm;
  const challengeCheck = await checkDailyChallenges(cultivatorId);
  if (!challengeCheck.success) {
    return c.json({ error: '今日挑战次数已用完（每日限10次）' }, 400);
  }

  const isEmpty = await isRankingEmpty(rankingRealm);
  const challengerRank = await getCultivatorRank(rankingRealm, cultivatorId);

  if (
    (!targetId || targetId === '') &&
    isOwnRealmRanking &&
    isEmpty &&
    challengerRank === null
  ) {
    return c.json({
      success: true,
      message: '可直接上榜',
      data: {
        directEntry: true,
        realm: rankingRealm,
        rank: 1,
        remainingChallenges: challengeCheck.remaining,
      },
    });
  }

  if (!targetId || targetId.trim() === '') {
    return c.json(
      {
        error: isOwnRealmRanking
          ? '请提供被挑战者ID'
          : '越境榜单不可直接上榜，请选择榜上修士切磋',
      },
      400,
    );
  }

  const targetRank = await getCultivatorRank(rankingRealm, targetId);
  if (targetRank === null) {
    return c.json({ error: '被挑战者不在排行榜上' }, 404);
  }

  if (await isLocked(targetId)) {
    return c.json({ error: '被挑战者正在被其他玩家挑战，请稍后再试' }, 409);
  }

  return c.json({
    success: true,
    message: '挑战验证通过，可以开始战斗',
    data: {
      cultivatorId,
      targetId,
      realm: rankingRealm,
      challengerRank,
      targetRank,
      affectsRanking: isOwnRealmRanking,
      remainingChallenges: challengeCheck.remaining,
    },
  });
});

challengeRouter.post('/challenge-battle', requireActiveCultivatorRef(), (c) => {
  return c.json(
    {
      error:
        '旧接口 /api/rankings/challenge-battle 已废弃，请使用 /api/rankings/challenge-battle/v5',
    },
    410,
  );
});

challengeRouter.post(
  '/challenge-battle/v5',
  requireActiveCultivatorRef(),
  async (c) => {
    const user = c.get('user');
    const challenger = c.get('activeCultivatorRef');
    if (!user || !challenger) {
      return c.json({ error: '未授权访问' }, 401);
    }

    try {
      const parsed = ChallengeBattleSchema.parse(await c.req.json());
      const ownRealm = (
        await readCultivatorRealm(challenger.cultivatorId)
      ).realm;
      const rankingRealm = parsed.realm ?? ownRealm;
      const committed = await runRankingBattleCommand({
        userId: user.id,
        cultivatorId: challenger.cultivatorId,
        targetId: parsed.targetId,
        rankingRealm,
      });
      return c.json({
        success: true,
        data: committed.result,
        state: committed.state,
      });
    } catch (error) {
      if (error instanceof RankingCommandError) {
        return c.json({ error: error.message }, error.status);
      }
      console.error('挑战战斗流程错误:', error);
      return c.json(
        { error: error instanceof Error ? error.message : '挑战失败' },
        500,
      );
    }
  },
);

router.route('/', publicRouter);
router.route('/', challengeRouter);

export default router;
