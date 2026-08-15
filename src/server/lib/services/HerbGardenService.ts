import { db, type DbTransaction } from '@server/lib/drizzle/db';
import {
  consumables,
  cultivatorFriends,
  cultivators,
  herbGardenInteractions,
  herbGardenPlots,
  herbGardenProfiles,
  materials,
  sectFacilities,
  sectMemberships,
} from '@server/lib/drizzle/schema';
import {
  CULTIVATION_METHODS,
  HERB_GARDEN_MAX_HELPERS,
  HERB_GARDEN_MAX_STEAL_RATIO,
  HERB_GARDEN_PLOT_COUNT,
  HIDDEN_SPIRIT_SEED_KEY,
  createSpiritSeedDetails,
  findCultivationMethod,
  nextHerbGardenStage,
  readSpiritSeedDetails,
  resolveCultivationMethod,
  resolveOutcomeKind,
  type CultivationMethodId,
  type HerbGardenFriendView,
  type HerbGardenHarvestResult,
  type HerbGardenLogView,
  type HerbGardenStage,
  type HerbGardenStageRecord,
  type HerbGardenState,
  type SpiritSeedHiddenSpec,
} from '@shared/contracts/herbGarden';
import type {
  ElementType,
  MaterialType,
  Quality,
} from '@shared/types/constants';
import type { SpiritFruitSpec } from '@shared/types/consumable';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { addMaterialStackToInventory } from './materialInventory';

const GARDEN_FACILITY_KEYS = [
  'herbGarden',
  'herb_garden',
  'herb-garden',
  'garden',
];
const QUALITY_ORDER: readonly Quality[] = [
  '凡品',
  '灵品',
  '玄品',
  '真品',
  '地品',
  '天品',
  '仙品',
  '神品',
];
const STAGE_BASE_MINUTES: Record<Exclude<HerbGardenStage, 'ready'>, number> = {
  germination: 30,
  growth: 90,
  formation: 60,
};

export class HerbGardenError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

type SeedSnapshot = {
  name: string;
  rank: Quality;
  element?: ElementType;
  details: ReturnType<typeof createSpiritSeedDetails>;
};

type OutcomeSnapshot = {
  name: string;
  kind: HerbGardenHarvestResult['kind'];
  rank: Quality;
  quantity: number;
};

type StoredStageRecord = HerbGardenStageRecord & {
  fit: -1 | 0 | 1;
  scoreDelta: number;
};

function hiddenSeed(snapshot: SeedSnapshot): SpiritSeedHiddenSpec {
  const hidden = snapshot.details[HIDDEN_SPIRIT_SEED_KEY];
  if (!hidden) throw new HerbGardenError('灵种内蕴数据缺失，无法继续培育', 500);
  return hidden;
}

function stageDurationMs(
  stage: Exclude<HerbGardenStage, 'ready'>,
  rank: Quality,
  multiplier: number,
): number {
  const rankScale = 1 + Math.max(0, QUALITY_ORDER.indexOf(rank)) * 0.25;
  return (
    Math.max(
      5,
      Math.round(STAGE_BASE_MINUTES[stage] * rankScale * multiplier),
    ) * 60_000
  );
}

async function assertActiveCultivator(cultivatorId: string): Promise<string> {
  const [row] = await db
    .select({ name: cultivators.name })
    .from(cultivators)
    .where(
      and(eq(cultivators.id, cultivatorId), eq(cultivators.status, 'active')),
    )
    .limit(1);
  if (!row) throw new HerbGardenError('道友不存在或已无法访问', 404);
  return row.name;
}

async function assertFriend(viewerId: string, ownerId: string): Promise<void> {
  if (viewerId === ownerId) return;
  const [row] = await db
    .select({ id: cultivatorFriends.id })
    .from(cultivatorFriends)
    .where(
      and(
        eq(cultivatorFriends.cultivatorId, viewerId),
        eq(cultivatorFriends.friendCultivatorId, ownerId),
      ),
    )
    .limit(1);
  if (!row) throw new HerbGardenError('只有好友才能进入这片灵田', 403);
}

async function getGardenLevel(cultivatorId: string): Promise<number> {
  const [membership] = await db
    .select({ sectId: sectMemberships.sectId })
    .from(sectMemberships)
    .where(
      and(
        eq(sectMemberships.cultivatorId, cultivatorId),
        eq(sectMemberships.status, 'active'),
      ),
    )
    .limit(1);
  if (!membership) return 1;
  const rows = await db
    .select({ level: sectFacilities.level })
    .from(sectFacilities)
    .where(
      and(
        eq(sectFacilities.sectId, membership.sectId),
        inArray(sectFacilities.facilityKey, GARDEN_FACILITY_KEYS),
      ),
    );
  return Math.max(1, ...rows.map((row) => row.level));
}

async function ensureGardenInitialized(cultivatorId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(herbGardenProfiles)
      .values({ cultivatorId })
      .onConflictDoNothing()
      .returning({ id: herbGardenProfiles.cultivatorId });
    if (!created) return;
    const details = createSpiritSeedDetails(
      `starter:${cultivatorId}`,
      'starter',
    );
    await addMaterialStackToInventory(
      cultivatorId,
      {
        name: '青露灵籽',
        type: 'seed',
        rank: '灵品',
        element: '木',
        quantity: 6,
        description: '司农堂发放的入门灵种，真实种性需在培育中逐步判断。',
        details,
      },
      tx,
    );
  });
}

async function consumeMaterialById(
  tx: DbTransaction,
  cultivatorId: string,
  materialId: string,
  requiredType?: string,
) {
  const [row] = await tx
    .select({
      id: materials.id,
      name: materials.name,
      type: materials.type,
      rank: materials.rank,
      element: materials.element,
      details: materials.details,
      quantity: materials.quantity,
    })
    .from(materials)
    .where(
      and(
        eq(materials.id, materialId),
        eq(materials.cultivatorId, cultivatorId),
        gt(materials.quantity, 0),
      ),
    )
    .limit(1);
  if (!row || (requiredType && row.type !== requiredType))
    throw new HerbGardenError(
      requiredType === 'seed' ? '找不到可用灵种' : '所选培育材料不符合要求',
      409,
    );
  const [updated] = await tx
    .update(materials)
    .set({ quantity: sql`${materials.quantity} - 1` })
    .where(and(eq(materials.id, row.id), gt(materials.quantity, 0)))
    .returning({ quantity: materials.quantity });
  if (!updated) throw new HerbGardenError('材料数量已经变化，请重试', 409);
  if (updated.quantity <= 0)
    await tx.delete(materials).where(eq(materials.id, row.id));
  return row;
}

async function payMethodCost(
  tx: DbTransaction,
  cultivatorId: string,
  methodId: CultivationMethodId,
  materialId?: string,
) {
  const method = findCultivationMethod(methodId);
  if (!method) throw new HerbGardenError('未知培育法', 400);
  if (methodId === 'qi_acceleration') {
    const [paid] = await tx
      .update(cultivators)
      .set({ qi: sql`${cultivators.qi} - 20` })
      .where(
        and(eq(cultivators.id, cultivatorId), sql`${cultivators.qi} >= 20`),
      )
      .returning({ id: cultivators.id });
    if (!paid) throw new HerbGardenError('天地灵气不足 20 点', 409);
  } else if (methodId === 'spirit_stone_stabilize') {
    const [paid] = await tx
      .update(cultivators)
      .set({ spirit_stones: sql`${cultivators.spirit_stones} - 100` })
      .where(
        and(
          eq(cultivators.id, cultivatorId),
          sql`${cultivators.spirit_stones} >= 100`,
        ),
      )
      .returning({ id: cultivators.id });
    if (!paid) throw new HerbGardenError('灵石不足 100 枚', 409);
  } else if (method.materialType) {
    if (!materialId)
      throw new HerbGardenError(
        `「${method.name}」需要选择一份${method.materialType}材料`,
        400,
      );
    await consumeMaterialById(
      tx,
      cultivatorId,
      materialId,
      method.materialType,
    );
  }
}

function resolveStage(
  snapshot: SeedSnapshot,
  stage: Exclude<HerbGardenStage, 'ready'>,
  methodId: CultivationMethodId,
): StoredStageRecord {
  const method = findCultivationMethod(methodId);
  if (!method) throw new HerbGardenError('未知培育法', 400);
  const result = resolveCultivationMethod(hiddenSeed(snapshot), methodId);
  return {
    stage,
    methodId,
    methodName: method.name,
    feedback: result.feedback,
    fit: result.fit,
    scoreDelta: result.scoreDelta,
    resolvedAt: new Date().toISOString(),
  };
}

export async function plantHerb(
  cultivatorId: string,
  input: {
    slot: number;
    seedMaterialId: string;
    methodId: CultivationMethodId;
    materialId?: string;
  },
): Promise<void> {
  if (
    !Number.isInteger(input.slot) ||
    input.slot < 1 ||
    input.slot > HERB_GARDEN_PLOT_COUNT
  )
    throw new HerbGardenError('灵畦编号无效', 400);
  await ensureGardenInitialized(cultivatorId);
  const gardenLevel = await getGardenLevel(cultivatorId);
  const method = findCultivationMethod(input.methodId);
  if (!method || method.minGardenLevel > gardenLevel)
    throw new HerbGardenError('当前药圃等级尚未解锁此培育法', 403);

  await db.transaction(async (tx) => {
    const [occupied] = await tx
      .select({ id: herbGardenPlots.id })
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.cultivatorId, cultivatorId),
          eq(herbGardenPlots.slot, input.slot),
        ),
      )
      .limit(1);
    if (occupied) throw new HerbGardenError('这块灵畦已有灵植', 409);
    const seed = await consumeMaterialById(
      tx,
      cultivatorId,
      input.seedMaterialId,
      'seed',
    );
    const details = readSpiritSeedDetails(seed.details);
    if (!details?.[HIDDEN_SPIRIT_SEED_KEY])
      throw new HerbGardenError('这枚种子缺少完整种性，无法播种', 400);
    const snapshot: SeedSnapshot = {
      name: seed.name,
      rank: seed.rank as Quality,
      element: (seed.element ?? undefined) as ElementType | undefined,
      details,
    };
    await payMethodCost(tx, cultivatorId, input.methodId, input.materialId);
    const record = resolveStage(snapshot, 'germination', input.methodId);
    const resolution = resolveCultivationMethod(
      hiddenSeed(snapshot),
      input.methodId,
    );
    const now = new Date();
    const readyAt = new Date(
      now.getTime() +
        stageDurationMs(
          'germination',
          snapshot.rank,
          resolution.durationMultiplier,
        ),
    );
    const [plot] = await tx
      .insert(herbGardenPlots)
      .values({
        cultivatorId,
        slot: input.slot,
        stage: 'germination',
        seedName: snapshot.name,
        seedRank: snapshot.rank,
        seedElement: snapshot.element ?? null,
        seedSnapshot: snapshot,
        stageHistory: [record],
        currentScore: record.scoreDelta,
        plantedAt: now,
        readyAt,
      })
      .returning({ id: herbGardenPlots.id });
    await tx.insert(herbGardenInteractions).values({
      plotId: plot.id,
      ownerId: cultivatorId,
      actorId: cultivatorId,
      action: 'plant',
      plantName: snapshot.name,
      payload: { slot: input.slot, methodId: input.methodId },
    });
  });
}

export async function cultivatePlot(
  cultivatorId: string,
  plotId: string,
  input: { methodId: CultivationMethodId; materialId?: string },
): Promise<void> {
  await ensureGardenInitialized(cultivatorId);
  const gardenLevel = await getGardenLevel(cultivatorId);
  const method = findCultivationMethod(input.methodId);
  if (!method || method.minGardenLevel > gardenLevel)
    throw new HerbGardenError('当前药圃等级尚未解锁此培育法', 403);
  await db.transaction(async (tx) => {
    const [plot] = await tx
      .select()
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.id, plotId),
          eq(herbGardenPlots.cultivatorId, cultivatorId),
          lte(herbGardenPlots.readyAt, new Date()),
        ),
      )
      .limit(1)
      .for('update');
    if (!plot) throw new HerbGardenError('本阶段尚未完成，或灵植不存在', 409);
    const currentStage = plot.stage as HerbGardenStage;
    if (currentStage === 'formation' || currentStage === 'ready')
      throw new HerbGardenError('灵植已经凝华成熟，可以收获了', 409);
    const nextStage = nextHerbGardenStage(currentStage) as Exclude<
      HerbGardenStage,
      'ready'
    >;
    const snapshot = plot.seedSnapshot as SeedSnapshot;
    await payMethodCost(tx, cultivatorId, input.methodId, input.materialId);
    const record = resolveStage(snapshot, nextStage, input.methodId);
    const history = (plot.stageHistory as StoredStageRecord[] | null) ?? [];
    const resolution = resolveCultivationMethod(
      hiddenSeed(snapshot),
      input.methodId,
    );
    const readyAt = new Date(
      Date.now() +
        stageDurationMs(
          nextStage,
          snapshot.rank,
          resolution.durationMultiplier,
        ),
    );
    await tx
      .update(herbGardenPlots)
      .set({
        stage: nextStage,
        stageHistory: [...history, record],
        currentScore: plot.currentScore + record.scoreDelta,
        readyAt,
      })
      .where(eq(herbGardenPlots.id, plot.id));
    await tx.insert(herbGardenInteractions).values({
      plotId: plot.id,
      ownerId: cultivatorId,
      actorId: cultivatorId,
      action: 'cultivate',
      plantName: plot.seedName,
      payload: {
        stage: nextStage,
        methodId: input.methodId,
        fit: record.fit,
      },
    });
  });
}

function makeOutcome(
  plot: typeof herbGardenPlots.$inferSelect,
): OutcomeSnapshot {
  if (plot.outcomeSnapshot) return plot.outcomeSnapshot as OutcomeSnapshot;
  const snapshot = plot.seedSnapshot as SeedSnapshot;
  const kind = resolveOutcomeKind(
    hiddenSeed(snapshot),
    plot.currentScore,
    Math.random(),
  );
  const base =
    snapshot.name.replace(/[灵道玄异]?种$|灵籽$|玄籽$|灵核$/, '') || '无名灵株';
  const name =
    kind === 'spirit_fruit'
      ? `${base}灵果`
      : kind === 'treasure'
        ? `${base}道蕴`
        : `${base}灵株`;
  const quantity = Math.max(
    5,
    Math.min(8, 5 + Math.floor(plot.currentScore / 24)),
  );
  return { name, kind, rank: snapshot.rank, quantity };
}

async function awardOutcome(
  tx: DbTransaction,
  cultivatorId: string,
  outcome: OutcomeSnapshot,
  quantity: number,
  element?: ElementType,
) {
  if (outcome.kind === 'spirit_fruit') {
    const value = Math.max(20, (QUALITY_ORDER.indexOf(outcome.rank) + 1) * 35);
    const spec: SpiritFruitSpec = {
      kind: 'spirit_fruit',
      family: 'cultivation',
      operations: [{ type: 'gain_progress', target: 'cultivation_exp', value }],
      consumeRules: {
        scene: 'out_of_battle_only',
        quotaCategory: 'cultivation',
      },
      cultivationMeta: {
        source: 'herb_garden',
        element,
        tags: ['灵田', '草木凝华'],
      },
    };
    const [existing] = await tx
      .select({ id: consumables.id, quantity: consumables.quantity })
      .from(consumables)
      .where(
        and(
          eq(consumables.cultivatorId, cultivatorId),
          eq(consumables.name, outcome.name),
          eq(consumables.quality, outcome.rank),
          eq(consumables.type, '灵果'),
          eq(consumables.spec, spec),
        ),
      )
      .limit(1);
    if (existing)
      await tx
        .update(consumables)
        .set({ quantity: existing.quantity + quantity })
        .where(eq(consumables.id, existing.id));
    else
      await tx.insert(consumables).values({
        cultivatorId,
        name: outcome.name,
        type: '灵果',
        quality: outcome.rank,
        quantity,
        description: '灵植凝华所结果实，服用后可增长修为。',
        score: value,
        spec,
      });
    return;
  }
  await addMaterialStackToInventory(
    cultivatorId,
    {
      name: outcome.name,
      type: outcome.kind === 'treasure' ? 'tcdb' : 'herb',
      rank: outcome.rank,
      element,
      description:
        outcome.kind === 'treasure'
          ? '三阶段培育中偶然凝成的草木道蕴。'
          : '灵田三阶段培育所得的成熟灵药。',
      details: { source: 'herb_garden', cultivationVersion: 1 },
      quantity,
    },
    tx,
  );
}

export async function harvestHerb(
  cultivatorId: string,
  plotId: string,
): Promise<HerbGardenHarvestResult> {
  await ensureGardenInitialized(cultivatorId);
  return db.transaction(async (tx) => {
    const [plot] = await tx
      .select()
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.id, plotId),
          eq(herbGardenPlots.cultivatorId, cultivatorId),
          eq(herbGardenPlots.stage, 'formation'),
          lte(herbGardenPlots.readyAt, new Date()),
        ),
      )
      .limit(1)
      .for('update');
    if (!plot) throw new HerbGardenError('灵植尚未凝华成熟，或已经被收获', 409);
    const outcome = makeOutcome(plot);
    const remaining =
      plot.remainingYield > 0 ? plot.remainingYield : outcome.quantity;
    await awardOutcome(
      tx,
      cultivatorId,
      outcome,
      remaining,
      (plot.seedElement ?? undefined) as ElementType | undefined,
    );
    let returnedSeed: HerbGardenHarvestResult['returnedSeed'];
    if (Math.random() < Math.min(0.55, 0.2 + plot.currentScore / 300)) {
      const details = createSpiritSeedDetails(
        `return:${plot.id}:${plot.currentScore}`,
        'harvest',
      );
      const seedName = `${outcome.name}遗种`;
      await addMaterialStackToInventory(
        cultivatorId,
        {
          name: seedName,
          type: 'seed',
          rank: outcome.rank,
          element: (plot.seedElement ?? undefined) as ElementType | undefined,
          description: '成熟灵株留下的一枚新种，种性已重新生成。',
          details,
          quantity: 1,
        },
        tx,
      );
      returnedSeed = { name: seedName, quantity: 1 };
    }
    await tx.delete(herbGardenPlots).where(eq(herbGardenPlots.id, plot.id));
    await tx
      .update(herbGardenProfiles)
      .set({ totalHarvests: sql`${herbGardenProfiles.totalHarvests} + 1` })
      .where(eq(herbGardenProfiles.cultivatorId, cultivatorId));
    await tx.insert(herbGardenInteractions).values({
      plotId: plot.id,
      ownerId: cultivatorId,
      actorId: cultivatorId,
      action: 'harvest',
      plantName: outcome.name,
      payload: { kind: outcome.kind, quantity: remaining },
    });
    return { ...outcome, quantity: remaining, returnedSeed };
  });
}

export async function harvestAllReadyHerbs(
  cultivatorId: string,
): Promise<HerbGardenHarvestResult[]> {
  const rows = await db
    .select({ id: herbGardenPlots.id })
    .from(herbGardenPlots)
    .where(
      and(
        eq(herbGardenPlots.cultivatorId, cultivatorId),
        eq(herbGardenPlots.stage, 'formation'),
        lte(herbGardenPlots.readyAt, new Date()),
      ),
    );
  const results: HerbGardenHarvestResult[] = [];
  for (const row of rows) {
    try {
      results.push(await harvestHerb(cultivatorId, row.id));
    } catch (error) {
      if (!(error instanceof HerbGardenError) || error.status !== 409)
        throw error;
    }
  }
  return results;
}

export async function helpFriendPlot(
  actorId: string,
  ownerId: string,
  plotId: string,
): Promise<void> {
  if (actorId === ownerId)
    throw new HerbGardenError('自己的灵田无需好友帮助', 400);
  await assertFriend(actorId, ownerId);
  await db.transaction(async (tx) => {
    const [plot] = await tx
      .select()
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.id, plotId),
          eq(herbGardenPlots.cultivatorId, ownerId),
          gt(herbGardenPlots.readyAt, new Date()),
        ),
      )
      .limit(1)
      .for('update');
    if (!plot) throw new HerbGardenError('这株灵植当前无需帮助', 409);
    const [countRow] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(herbGardenInteractions)
      .where(
        and(
          eq(herbGardenInteractions.plotId, plotId),
          eq(herbGardenInteractions.action, 'help'),
        ),
      );
    if ((countRow?.count ?? 0) >= HERB_GARDEN_MAX_HELPERS)
      throw new HerbGardenError('本轮灵植已经得到足够多道友照料', 409);
    const [inserted] = await tx
      .insert(herbGardenInteractions)
      .values({
        plotId,
        ownerId,
        actorId,
        action: 'help',
        plantName: plot.seedName,
        payload: { stage: plot.stage },
      })
      .onConflictDoNothing()
      .returning({ id: herbGardenInteractions.id });
    if (!inserted) throw new HerbGardenError('这一轮你已经帮过这株灵植了', 409);
    const remaining = Math.max(60_000, plot.readyAt.getTime() - Date.now());
    await tx
      .update(herbGardenPlots)
      .set({
        readyAt: new Date(
          Math.max(
            Date.now() + 60_000,
            plot.readyAt.getTime() - remaining * 0.05,
          ),
        ),
      })
      .where(eq(herbGardenPlots.id, plotId));
  });
}

export async function stealFriendHerb(
  actorId: string,
  ownerId: string,
  plotId: string,
): Promise<{ name: string; kind: OutcomeSnapshot['kind']; quantity: 1 }> {
  if (actorId === ownerId)
    throw new HerbGardenError('自己的灵植直接收获即可', 400);
  await assertFriend(actorId, ownerId);
  return db.transaction(async (tx) => {
    const [plot] = await tx
      .select()
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.id, plotId),
          eq(herbGardenPlots.cultivatorId, ownerId),
          eq(herbGardenPlots.stage, 'formation'),
          lte(herbGardenPlots.readyAt, new Date()),
        ),
      )
      .limit(1)
      .for('update');
    if (!plot) throw new HerbGardenError('这里没有可采的成熟灵植', 409);
    const outcome = makeOutcome(plot);
    const initialYield =
      plot.remainingYield > 0 ? plot.remainingYield : outcome.quantity;
    const stealLimit =
      plot.stealLimit > 0
        ? plot.stealLimit
        : Math.min(
            Math.floor(initialYield * HERB_GARDEN_MAX_STEAL_RATIO),
            Math.max(0, initialYield - 1),
          );
    if (stealLimit <= plot.stolenCount || initialYield <= 1)
      throw new HerbGardenError('可供访客采走的份额已经没有了', 409);
    const [inserted] = await tx
      .insert(herbGardenInteractions)
      .values({
        plotId,
        ownerId,
        actorId,
        action: 'steal',
        plantName: outcome.name,
        payload: { kind: outcome.kind, quantity: 1 },
      })
      .onConflictDoNothing()
      .returning({ id: herbGardenInteractions.id });
    if (!inserted) throw new HerbGardenError('这一轮你已经采过了', 409);
    await awardOutcome(
      tx,
      actorId,
      outcome,
      1,
      (plot.seedElement ?? undefined) as ElementType | undefined,
    );
    await tx
      .update(herbGardenPlots)
      .set({
        outcomeSnapshot: outcome,
        remainingYield: initialYield - 1,
        stealLimit,
        stolenCount: plot.stolenCount + 1,
      })
      .where(eq(herbGardenPlots.id, plot.id));
    await tx
      .update(herbGardenProfiles)
      .set({ totalVisits: sql`${herbGardenProfiles.totalVisits} + 1` })
      .where(eq(herbGardenProfiles.cultivatorId, ownerId));
    return { name: outcome.name, kind: outcome.kind, quantity: 1 };
  });
}

async function buildLogs(ownerId: string): Promise<HerbGardenLogView[]> {
  const rows = await db
    .select({
      id: herbGardenInteractions.id,
      action: herbGardenInteractions.action,
      actorId: herbGardenInteractions.actorId,
      ownerId: herbGardenInteractions.ownerId,
      plantName: herbGardenInteractions.plantName,
      createdAt: herbGardenInteractions.createdAt,
    })
    .from(herbGardenInteractions)
    .where(eq(herbGardenInteractions.ownerId, ownerId))
    .orderBy(desc(herbGardenInteractions.createdAt))
    .limit(20);
  if (!rows.length) return [];
  const actors = await db
    .select({ id: cultivators.id, name: cultivators.name })
    .from(cultivators)
    .where(
      inArray(cultivators.id, [...new Set(rows.map((row) => row.actorId))]),
    );
  const names = new Map(actors.map((actor) => [actor.id, actor.name]));
  return rows.map((row) => {
    const actorName = names.get(row.actorId) ?? '一位道友';
    const action = row.action as HerbGardenLogView['action'];
    const message =
      action === 'steal'
        ? `${actorName}来访时采走了「${row.plantName} ×1」。`
        : action === 'help'
          ? `${actorName}为「${row.plantName}」引来一缕灵气。`
          : action === 'harvest'
            ? `收获了一轮「${row.plantName}」。`
            : action === 'cultivate'
              ? `以新法继续培育「${row.plantName}」。`
              : `在灵畦播下了「${row.plantName}」。`;
    return {
      ...row,
      action,
      actorName,
      message,
      createdAt: row.createdAt.toISOString(),
    };
  });
}

async function buildFriendList(
  cultivatorId: string,
): Promise<HerbGardenFriendView[]> {
  const relations = await db
    .select({ friendId: cultivatorFriends.friendCultivatorId })
    .from(cultivatorFriends)
    .where(eq(cultivatorFriends.cultivatorId, cultivatorId));
  const ids = relations.map((row) => row.friendId);
  if (!ids.length) return [];
  const [friends, plots] = await Promise.all([
    db
      .select({
        id: cultivators.id,
        name: cultivators.name,
        realm: cultivators.realm,
      })
      .from(cultivators)
      .where(
        and(inArray(cultivators.id, ids), eq(cultivators.status, 'active')),
      ),
    db
      .select({
        ownerId: herbGardenPlots.cultivatorId,
        stage: herbGardenPlots.stage,
        readyAt: herbGardenPlots.readyAt,
      })
      .from(herbGardenPlots)
      .where(inArray(herbGardenPlots.cultivatorId, ids)),
  ]);
  const now = Date.now();
  return friends
    .map((friend) => {
      const own = plots.filter((plot) => plot.ownerId === friend.id);
      return {
        cultivatorId: friend.id,
        name: friend.name,
        realm: friend.realm,
        readyPlots: own.filter(
          (plot) => plot.stage === 'formation' && plot.readyAt.getTime() <= now,
        ).length,
        growingPlots: own.filter((plot) => plot.readyAt.getTime() > now).length,
        canVisit: true,
      };
    })
    .sort(
      (a, b) =>
        b.readyPlots - a.readyPlots || a.name.localeCompare(b.name, 'zh-CN'),
    );
}

export async function getHerbGardenState(
  viewerId: string,
  ownerId = viewerId,
): Promise<HerbGardenState> {
  await assertFriend(viewerId, ownerId);
  const ownerName = await assertActiveCultivator(ownerId);
  await ensureGardenInitialized(ownerId);
  const isSelf = viewerId === ownerId;
  const [
    profiles,
    rows,
    logs,
    gardenLevel,
    seeds,
    methodMaterials,
    friends,
    viewerActions,
    helperRows,
  ] = await Promise.all([
    db
      .select({ totalHarvests: herbGardenProfiles.totalHarvests })
      .from(herbGardenProfiles)
      .where(eq(herbGardenProfiles.cultivatorId, ownerId))
      .limit(1),
    db
      .select()
      .from(herbGardenPlots)
      .where(eq(herbGardenPlots.cultivatorId, ownerId)),
    buildLogs(ownerId),
    getGardenLevel(ownerId),
    isSelf
      ? db
          .select({
            id: materials.id,
            name: materials.name,
            rank: materials.rank,
            element: materials.element,
            details: materials.details,
            quantity: materials.quantity,
          })
          .from(materials)
          .where(
            and(
              eq(materials.cultivatorId, ownerId),
              eq(materials.type, 'seed'),
              gt(materials.quantity, 0),
            ),
          )
      : Promise.resolve([]),
    isSelf
      ? db
          .select({
            id: materials.id,
            name: materials.name,
            type: materials.type,
            rank: materials.rank,
            quantity: materials.quantity,
          })
          .from(materials)
          .where(
            and(
              eq(materials.cultivatorId, ownerId),
              inArray(materials.type, ['herb', 'ore', 'monster', 'aux']),
              gt(materials.quantity, 0),
            ),
          )
      : Promise.resolve([]),
    isSelf ? buildFriendList(ownerId) : Promise.resolve([]),
    isSelf
      ? Promise.resolve([])
      : db
          .select({
            plotId: herbGardenInteractions.plotId,
            action: herbGardenInteractions.action,
          })
          .from(herbGardenInteractions)
          .where(
            and(
              eq(herbGardenInteractions.actorId, viewerId),
              eq(herbGardenInteractions.ownerId, ownerId),
              inArray(herbGardenInteractions.action, ['help', 'steal']),
            ),
          ),
    db
      .select({
        plotId: herbGardenInteractions.plotId,
        count: sql<number>`count(*)::int`,
      })
      .from(herbGardenInteractions)
      .where(
        and(
          eq(herbGardenInteractions.ownerId, ownerId),
          eq(herbGardenInteractions.action, 'help'),
        ),
      )
      .groupBy(herbGardenInteractions.plotId),
  ]);
  const actionsByPlot = new Map<string, Set<string>>();
  for (const action of viewerActions)
    if (action.plotId)
      actionsByPlot.set(
        action.plotId,
        new Set([...(actionsByPlot.get(action.plotId) ?? []), action.action]),
      );
  const helpers = new Map(
    helperRows.flatMap((row) =>
      row.plotId ? [[row.plotId, row.count] as const] : [],
    ),
  );
  const now = Date.now();
  const bySlot = new Map(rows.map((row) => [row.slot, row]));
  const plots = Array.from({ length: HERB_GARDEN_PLOT_COUNT }, (_, index) => {
    const slot = index + 1;
    const row = bySlot.get(slot);
    if (!row) return { slot, status: 'empty' as const };
    const stage = row.stage as HerbGardenStage;
    const elapsed = row.readyAt.getTime() <= now;
    const ready = stage === 'formation' && elapsed;
    const status = ready
      ? ('ready' as const)
      : elapsed
        ? ('awaiting_action' as const)
        : ('cultivating' as const);
    const snapshot = row.seedSnapshot as SeedSnapshot;
    const actions = actionsByPlot.get(row.id) ?? new Set<string>();
    const helperCount = helpers.get(row.id) ?? 0;
    const outcome = row.outcomeSnapshot as OutcomeSnapshot | null;
    const effectiveYield =
      row.remainingYield > 0 ? row.remainingYield : (outcome?.quantity ?? 0);
    return {
      slot,
      plotId: row.id,
      status,
      stage: ready ? ('ready' as const) : stage,
      seedName: row.seedName,
      seedRank: row.seedRank as Quality,
      element: (row.seedElement ?? undefined) as ElementType | undefined,
      hint: snapshot.details.hint,
      plantedAt: row.plantedAt.toISOString(),
      readyAt: row.readyAt.toISOString(),
      history: isSelf
        ? ((row.stageHistory as StoredStageRecord[] | null) ?? []).map(
            ({
              stage: recordStage,
              methodId,
              methodName,
              feedback,
              resolvedAt,
            }) => ({
              stage: recordStage,
              methodId,
              methodName,
              feedback,
              resolvedAt,
            }),
          )
        : undefined,
      remainingYield: ready ? effectiveYield : undefined,
      stealLimit: row.stealLimit,
      stolenCount: row.stolenCount,
      helperCount,
      alreadyHelped: actions.has('help'),
      alreadyStolen: actions.has('steal'),
      canHelp:
        !isSelf &&
        !elapsed &&
        helperCount < HERB_GARDEN_MAX_HELPERS &&
        !actions.has('help'),
      canSteal:
        !isSelf &&
        ready &&
        (row.stealLimit === 0 || row.stolenCount < row.stealLimit) &&
        !actions.has('steal'),
    };
  });
  const seedViews = seeds.flatMap((seed) => {
    const details = readSpiritSeedDetails(seed.details);
    return details
      ? [
          {
            materialId: seed.id,
            name: seed.name,
            rank: seed.rank as Quality,
            element: (seed.element ?? undefined) as ElementType | undefined,
            hint: details.hint,
            fingerprint: details.fingerprint,
            quantity: seed.quantity,
          },
        ]
      : [];
  });
  return {
    owner: { cultivatorId: ownerId, name: ownerName, isSelf },
    gardenLevel,
    methods: CULTIVATION_METHODS.filter(
      (method) => method.minGardenLevel <= gardenLevel,
    ),
    plots,
    seeds: seedViews,
    methodMaterials: methodMaterials.map((material) => ({
      materialId: material.id,
      name: material.name,
      type: material.type as Exclude<MaterialType, 'seed'>,
      rank: material.rank as Quality,
      quantity: material.quantity,
    })),
    logs,
    friends,
    summary: {
      planted: plots.filter((plot) => plot.status !== 'empty').length,
      awaitingAction: plots.filter((plot) => plot.status === 'awaiting_action')
        .length,
      ready: plots.filter((plot) => plot.status === 'ready').length,
      totalHarvests: profiles[0]?.totalHarvests ?? 0,
    },
  };
}
