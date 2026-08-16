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
  spiritualRoots,
} from '@server/lib/drizzle/schema';
import {
  CULTIVATION_METHODS,
  FORMATION_METHODS,
  HERB_GARDEN_MAX_HELPERS,
  HERB_GARDEN_MAX_OBSERVATIONS_PER_STAGE,
  HERB_GARDEN_MAX_QUESTIONS_PER_STAGE,
  HERB_GARDEN_MAX_STEAL_RATIO,
  HERB_GARDEN_PLOT_COUNT,
  canCultivateSeedQuality,
  createSpiritSeedDetails,
  findCultivationMethod,
  findFormationMethod,
  getHerbGardenMaxSeedQuality,
  nextHerbGardenStage,
  readSpiritSeedDetails,
  readSpiritSeedSpec,
  resolveCultivationMethod,
  resolveOutcomeKind,
  resolveOutcomeQuality,
  resolveOutcomeQuantity,
  resolveSpiritFruitEffects,
  type ActiveHerbGardenStage,
  type CultivationMethodId,
  type FormationMethodId,
  type HerbGardenActionId,
  type HerbGardenConsultationRecord,
  type HerbGardenFriendView,
  type HerbGardenHarvestResult,
  type HerbGardenLogView,
  type HerbGardenObservationKind,
  type HerbGardenObservationRecord,
  type HerbGardenStage,
  type HerbGardenStageRecord,
  type HerbGardenState,
  type SpiritSeedDetails,
  type SpiritSeedSpec,
  type StageRuleResolution,
} from '@shared/contracts/herbGarden';
import type {
  ElementType,
  MaterialType,
  Quality,
  RealmType,
} from '@shared/types/constants';
import type { SpiritFruitSpec } from '@shared/types/consumable';
import { and, desc, eq, gt, inArray, lte, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { ConditionService } from './ConditionService';
import { HerbGardenNarrativeService } from './HerbGardenNarrativeService';
import { QiInsufficientError, QiService } from './QiService';
import { loadCultivatorCombatInput } from './cultivator/CultivatorCombatProjectionReader';
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
const STAGE_BASE_MINUTES: Record<ActiveHerbGardenStage, number> = {
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
  description?: string;
  rank: Quality;
  element?: ElementType;
  details: SpiritSeedDetails;
};

type OutcomeSnapshot = {
  name: string;
  description: string;
  kind: HerbGardenHarvestResult['kind'];
  rank: Quality;
  quantity: number;
  formationMethodId: FormationMethodId;
  cultivation: {
    sourceSeedName: string;
    manifestationTags: string[];
  };
  spiritFruitSpec?: SpiritFruitSpec;
};

type StoredStageRecord = HerbGardenStageRecord & {
  ruleScore: number;
  scoreDelta: number;
};
type StoredJournalEntry =
  | StoredStageRecord
  | HerbGardenObservationRecord
  | HerbGardenConsultationRecord;

type CostContext = {
  material?: {
    name: string;
    rank: Quality;
    element?: ElementType;
  };
  rootElement?: ElementType;
  rootStrength?: number;
};

type NarrativeContext = {
  plotId: string;
  seed: SeedSnapshot;
  spec: SpiritSeedSpec;
  record: StoredStageRecord;
  rule: StageRuleResolution;
  methodTags: string[];
  environmentTags: string[];
  cost: CostContext;
};

function seedSpec(snapshot: SeedSnapshot): SpiritSeedSpec {
  const spec = readSpiritSeedSpec(snapshot.details);
  if (!spec) throw new HerbGardenError('灵种内蕴数据缺失，无法继续培育', 500);
  return spec;
}

function isObservationRecord(
  entry: StoredJournalEntry,
): entry is HerbGardenObservationRecord {
  return entry.kind === 'observation';
}

function isConsultationRecord(
  entry: StoredJournalEntry,
): entry is HerbGardenConsultationRecord {
  return entry.kind === 'consultation';
}

function isCultivationRecord(
  entry: StoredJournalEntry,
): entry is StoredStageRecord {
  return !isObservationRecord(entry) && !isConsultationRecord(entry);
}

const OBSERVATION_NAMES: Record<HerbGardenObservationKind, string> = {
  appearance: '察叶色',
  aura: '辨灵气',
  soil: '验土性',
  root: '探根须',
};

function observationSafeFact(
  spec: SpiritSeedSpec,
  observation: HerbGardenObservationKind,
): string {
  if (observation === 'appearance') {
    if (spec.growthTraitTags.includes('fruiting'))
      return '枝叶间已有细小花苞般的灵机聚点，这株灵植有结果倾向。';
    if (spec.growthTraitTags.includes('medicinal_condensing'))
      return '新叶的汁脉比茎干更浓，药性正向枝叶收拢。';
    return '叶色与叶缘只显出温和生机，暂无明显的成型征兆。';
  }
  if (observation === 'aura') {
    if (spec.preferredEnvironmentTags.includes('qi_dense'))
      return '它会主动牵引近旁游离灵气，对灵气充沛的环境反应更好。';
    if (spec.avoidedEnvironmentTags.includes('qi_dense'))
      return '灵气稍一浓聚，叶面气息便有凝滞，它未必耐受过盛灵气。';
    return '植株吐纳灵气的节律平稳，对当前灵机浓淡没有明显偏转。';
  }
  if (observation === 'soil') {
    if (spec.preferredEnvironmentTags.includes('moist_watered'))
      return '根际水气散得很慢，土壤湿润时叶面更舒展。';
    if (spec.preferredEnvironmentTags.includes('mineral_rich'))
      return '细根会向土中矿粒密集处伸展，显然会借矿性固根。';
    if (spec.preferredEnvironmentTags.includes('sunlit_dry'))
      return '表土稍干时茎叶反而更挺拔，它似乎喜偏干暖的土性。';
    return '根际土性平和，暂时看不出它对湿度或矿性的明显喜恶。';
  }
  if (spec.growthTraitTags.includes('deep_rooted'))
    return '主根向下扎得很深，适合稳住土壤与根系后再行养护。';
  if (spec.growthTraitTags.includes('delicate_root'))
    return '细根薄而易卷，剧烈改变土性可能会使它受扰。';
  return '根须分布均匀，未见明显的深根或娇嫩征象。';
}

function stageDurationMs(
  stage: ActiveHerbGardenStage,
  rank: Quality,
  multiplier: number,
  spec: SpiritSeedSpec,
): number {
  const rankScale = 1 + Math.max(0, QUALITY_ORDER.indexOf(rank)) * 0.25;
  const traitScale =
    stage === 'germination' && spec.growthTraitTags.includes('slow_germination')
      ? 1.15
      : stage === 'growth' && spec.growthTraitTags.includes('rapid_growth')
        ? 0.85
        : 1;
  return (
    Math.max(
      5,
      Math.round(
        STAGE_BASE_MINUTES[stage] * rankScale * multiplier * traitScale,
      ),
    ) * 60_000
  );
}

async function assertActiveCultivator(
  cultivatorId: string,
): Promise<{ name: string; realm: RealmType }> {
  const [row] = await db
    .select({ name: cultivators.name, realm: cultivators.realm })
    .from(cultivators)
    .where(
      and(eq(cultivators.id, cultivatorId), eq(cultivators.status, 'active')),
    )
    .limit(1);
  if (!row) throw new HerbGardenError('道友不存在或已无法访问', 404);
  return { name: row.name, realm: row.realm as RealmType };
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
        description:
          '青色籽壳在晨露中会浮起细纹，温和土性使其气息舒展；若骤然催入烈性灵机，壳纹便会短暂收拢。',
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
      description: materials.description,
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
    .limit(1)
    .for('update');
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

async function deductSpiritStones(
  tx: DbTransaction,
  cultivatorId: string,
  amount: number,
): Promise<void> {
  const [paid] = await tx
    .update(cultivators)
    .set({ spirit_stones: sql`${cultivators.spirit_stones} - ${amount}` })
    .where(
      and(
        eq(cultivators.id, cultivatorId),
        sql`${cultivators.spirit_stones} >= ${amount}`,
      ),
    )
    .returning({ id: cultivators.id });
  if (!paid) throw new HerbGardenError(`灵石不足 ${amount} 枚`, 409);
}

async function deductMp(
  tx: DbTransaction,
  cultivatorId: string,
  amount: number,
): Promise<void> {
  const [locked] = await tx
    .select({ id: cultivators.id })
    .from(cultivators)
    .where(eq(cultivators.id, cultivatorId))
    .limit(1)
    .for('update');
  if (!locked) throw new HerbGardenError('修士状态不存在', 404);
  const bundle = await loadCultivatorCombatInput(cultivatorId, tx);
  if (!bundle) throw new HerbGardenError('修士状态不存在', 404);
  const facts = bundle.cultivator;
  const normalized = ConditionService.tickNaturalRecovery(
    facts,
    facts.condition,
  );
  if (normalized.resources.mp.current < amount)
    throw new HerbGardenError(`当前法力不足 ${amount} 点`, 409);
  const next = ConditionService.applyExternalResourceLoss(facts, normalized, {
    mpFlat: amount,
  });
  await tx
    .update(cultivators)
    .set({ condition: next })
    .where(eq(cultivators.id, cultivatorId));
}

async function payMethodCost(
  tx: DbTransaction,
  cultivatorId: string,
  methodId: CultivationMethodId,
  input: { materialId?: string; rootElement?: ElementType },
): Promise<CostContext> {
  const method = findCultivationMethod(methodId);
  if (!method) throw new HerbGardenError('未知培育法', 400);
  const cost = method.cost;
  if (cost.kind === 'time') return {};
  if (cost.kind === 'qi') {
    const actionInstanceId = `herb-garden:${randomUUID()}`;
    try {
      await QiService.reserveQi({
        cultivatorId,
        action: 'herb_garden_qi_acceleration',
        actionInstanceId,
        cost: cost.amount,
        metadata: { methodId },
        tx,
      });
      await QiService.commitReservation({
        actionInstanceId,
        metadata: { methodId },
        tx,
      });
    } catch (error) {
      if (error instanceof QiInsufficientError) {
        throw new HerbGardenError(
          `天地灵气不足 ${cost.amount} 点（当前 ${error.current} 点）`,
          409,
        );
      }
      throw error;
    }
    return {};
  }
  if (cost.kind === 'spirit_stones') {
    await deductSpiritStones(tx, cultivatorId, cost.amount);
    return {};
  }
  if (cost.kind === 'mp') {
    if (!input.rootElement)
      throw new HerbGardenError('本命灵力灌注需要选择一条灵根', 400);
    const [root] = await tx
      .select({
        element: spiritualRoots.element,
        strength: spiritualRoots.strength,
      })
      .from(spiritualRoots)
      .where(
        and(
          eq(spiritualRoots.cultivatorId, cultivatorId),
          eq(spiritualRoots.element, input.rootElement),
        ),
      )
      .limit(1);
    if (!root) throw new HerbGardenError('所选灵根不属于当前修士', 400);
    await deductMp(tx, cultivatorId, cost.amount);
    return {
      rootElement: root.element as ElementType,
      rootStrength: root.strength,
    };
  }
  if (!input.materialId)
    throw new HerbGardenError(`「${method.name}」需要选择一份培育材料`, 400);
  const material = await consumeMaterialById(
    tx,
    cultivatorId,
    input.materialId,
    cost.materialType,
  );
  if (cost.spiritStones)
    await deductSpiritStones(tx, cultivatorId, cost.spiritStones);
  return {
    material: {
      name: material.name,
      rank: material.rank as Quality,
      element: (material.element ?? undefined) as ElementType | undefined,
    },
  };
}

function buildStageRecord(input: {
  stage: ActiveHerbGardenStage;
  actionId: HerbGardenActionId;
  actionName: string;
  rule: StageRuleResolution;
}): StoredStageRecord {
  return {
    kind: 'cultivation',
    recordId: crypto.randomUUID(),
    stage: input.stage,
    actionId: input.actionId,
    actionName: input.actionName,
    assessment: input.rule.fallbackAssessment,
    manifestation: `fallback_${input.rule.fallbackAssessment}`,
    discoveredHint: input.rule.fallbackHint,
    narrative: input.rule.fallbackNarrative,
    narrativeSource: 'fallback',
    ruleScore: input.rule.ruleScore,
    scoreDelta: input.rule.scoreDelta,
    resolvedAt: new Date().toISOString(),
  };
}

function resolveFormationRule(
  spec: SpiritSeedSpec,
  formationMethodId: FormationMethodId,
): StageRuleResolution {
  const formation = findFormationMethod(formationMethodId);
  if (!formation) throw new HerbGardenError('未知凝华方式', 400);
  let ruleScore =
    formation.outcomeBias && spec.outcomeBiases.includes(formation.outcomeBias)
      ? 3
      : 0;
  if (formationMethodId === 'natural_form') ruleScore = 3;
  if (
    formationMethodId === 'fruit_bloom' &&
    spec.growthTraitTags.includes('fruiting')
  )
    ruleScore += 1;
  if (
    formationMethodId === 'leaf_medicine' &&
    spec.growthTraitTags.includes('medicinal_condensing')
  )
    ruleScore += 1;
  if (
    formationMethodId === 'treasure_return' &&
    spec.growthTraitTags.includes('treasure_transforming')
  )
    ruleScore += 1;
  const fallbackAssessment = ruleScore >= 3 ? 'resonant' : 'neutral';
  return {
    ruleScore,
    scoreDelta: ruleScore >= 3 ? 18 : 6,
    durationMultiplier: ruleScore >= 3 ? 0.92 : 1,
    allowedAssessments:
      ruleScore >= 3 ? ['resonant', 'aligned'] : ['aligned', 'neutral'],
    fallbackAssessment,
    fallbackHint:
      ruleScore >= 3
        ? '花叶间的灵机自行归拢，隐约显出成型之兆。'
        : '草木精气缓慢收束，最终形态仍有几分未定。',
    fallbackNarrative:
      ruleScore >= 3
        ? '此前积蓄的草木灵机顺势凝成一体，枝叶间已有成熟异香。'
        : '灵植依照所选方向缓慢凝华，气息虽稳，尚未显出特殊异象。',
  };
}

async function enrichStageNarrative(
  context: NarrativeContext,
): Promise<StoredStageRecord> {
  const generated = await HerbGardenNarrativeService.assessStage({
    seed: {
      name: context.seed.name,
      description: context.seed.description,
      rank: context.seed.rank,
      element: context.seed.element,
      spec: context.spec,
    },
    stage: context.record.stage,
    actionName: context.record.actionName,
    methodTags: context.methodTags,
    environmentTags: context.environmentTags,
    material: context.cost.material,
    rootElement: context.cost.rootElement,
    rule: context.rule,
  });
  if (!generated) return context.record;
  const enriched: StoredStageRecord = {
    ...context.record,
    assessment: generated.assessment,
    manifestation: generated.manifestation,
    discoveredHint: generated.discoveredHint,
    narrative: generated.narrative,
    narrativeSource: 'llm',
  };
  const [plot] = await db
    .select({ history: herbGardenPlots.stageHistory })
    .from(herbGardenPlots)
    .where(eq(herbGardenPlots.id, context.plotId))
    .limit(1);
  if (!plot) return enriched;
  const history = (plot.history as StoredJournalEntry[]).map((record) =>
    record.recordId === enriched.recordId ? enriched : record,
  );
  await db
    .update(herbGardenPlots)
    .set({ stageHistory: history })
    .where(eq(herbGardenPlots.id, context.plotId));
  return enriched;
}

function fallbackOutcome(
  seed: SeedSnapshot,
  kind: OutcomeSnapshot['kind'],
  rank: Quality,
  quantity: number,
  formationMethodId: FormationMethodId,
  history: StoredStageRecord[],
): OutcomeSnapshot {
  const base =
    seed.name.replace(/[灵道玄异]?种$|灵籽$|玄籽$|灵核$|籽$/, '') || '无名';
  const name =
    kind === 'spirit_fruit'
      ? `${base}凝露果`
      : kind === 'tcdb'
        ? `${base}草木精粹`
        : `${base}灵药`;
  return {
    name,
    description:
      kind === 'spirit_fruit'
        ? '三阶段培育后凝成的灵果，果肉中留有原种草木灵机。'
        : kind === 'tcdb'
          ? '灵植返源凝成的草木灵珍，保留了培育过程中的主要异象。'
          : '经启灵、蕴养与凝华所得的成熟灵药，药性已经稳定。',
    kind,
    rank,
    quantity,
    formationMethodId,
    cultivation: {
      sourceSeedName: seed.name,
      manifestationTags: history.map((record) => record.manifestation),
    },
  };
}

async function enrichOutcomeName(
  plotId: string,
  seed: SeedSnapshot,
  outcome: OutcomeSnapshot,
): Promise<void> {
  const [plot] = await db
    .select({ history: herbGardenPlots.stageHistory })
    .from(herbGardenPlots)
    .where(eq(herbGardenPlots.id, plotId))
    .limit(1);
  if (!plot) return;
  const history = (plot.history as StoredJournalEntry[]).filter(
    isCultivationRecord,
  );
  const copy = await HerbGardenNarrativeService.nameOutcome({
    seed: {
      name: seed.name,
      description: seed.description,
      rank: seed.rank,
      element: seed.element,
    },
    kind: outcome.kind,
    quality: outcome.rank,
    quantity: outcome.quantity,
    history,
    operations: outcome.spiritFruitSpec?.operations,
  });
  if (!copy) return;
  await db
    .update(herbGardenPlots)
    .set({
      outcomeSnapshot: {
        ...outcome,
        name: copy.name,
        description: copy.description,
        cultivation: {
          ...outcome.cultivation,
          manifestationTags: history.map((record) => record.manifestation),
        },
      },
    })
    .where(eq(herbGardenPlots.id, plotId));
}

export async function plantHerb(
  cultivatorId: string,
  input: {
    slot: number;
    seedMaterialId: string;
    actionId: HerbGardenActionId;
    materialId?: string;
    rootElement?: ElementType;
  },
): Promise<void> {
  if (
    !Number.isInteger(input.slot) ||
    input.slot < 1 ||
    input.slot > HERB_GARDEN_PLOT_COUNT
  )
    throw new HerbGardenError('灵畦编号无效', 400);
  const actor = await assertActiveCultivator(cultivatorId);
  await ensureGardenInitialized(cultivatorId);
  const gardenLevel = await getGardenLevel(cultivatorId);
  const method = findCultivationMethod(input.actionId);
  if (!method || !method.stages.includes('germination'))
    throw new HerbGardenError('所选方式不能用于启灵阶段', 400);
  if (method.minGardenLevel > gardenLevel)
    throw new HerbGardenError('当前药圃等级尚未解锁此培育法', 403);

  const context = await db.transaction(
    async (tx): Promise<NarrativeContext> => {
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
      const spec = readSpiritSeedSpec(seed.details);
      if (!details || !spec)
        throw new HerbGardenError('这枚种子缺少完整种性，无法播种', 400);
      if (!canCultivateSeedQuality(actor.realm, seed.rank as Quality)) {
        throw new HerbGardenError(
          `当前${actor.realm}最高只能培育${getHerbGardenMaxSeedQuality(actor.realm)}灵种`,
          403,
        );
      }
      const snapshot: SeedSnapshot = {
        name: seed.name,
        description: seed.description ?? undefined,
        rank: seed.rank as Quality,
        element: (seed.element ?? undefined) as ElementType | undefined,
        details,
      };
      const cost = await payMethodCost(tx, cultivatorId, method.id, input);
      const rule = resolveCultivationMethod(spec, method.id, {
        materialElement: cost.material?.element ?? cost.rootElement,
        seedElement: snapshot.element,
      });
      const record = buildStageRecord({
        stage: 'germination',
        actionId: method.id,
        actionName: method.name,
        rule,
      });
      const now = new Date();
      const readyAt = new Date(
        now.getTime() +
          stageDurationMs(
            'germination',
            snapshot.rank,
            rule.durationMultiplier,
            spec,
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
        payload: { slot: input.slot, actionId: method.id },
      });
      return {
        plotId: plot.id,
        seed: snapshot,
        spec,
        record,
        rule,
        methodTags: method.methodTags,
        environmentTags: method.environmentTags,
        cost,
      };
    },
  );
  await enrichStageNarrative(context);
}

export async function cultivatePlot(
  cultivatorId: string,
  plotId: string,
  input: {
    actionId: HerbGardenActionId;
    materialId?: string;
    rootElement?: ElementType;
  },
): Promise<void> {
  await ensureGardenInitialized(cultivatorId);
  const gardenLevel = await getGardenLevel(cultivatorId);
  const result = await db.transaction(async (tx) => {
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
      throw new HerbGardenError('灵植已经进入凝华阶段，无需继续培育', 409);
    const nextStage = nextHerbGardenStage(
      currentStage,
    ) as ActiveHerbGardenStage;
    const snapshot = plot.seedSnapshot as SeedSnapshot;
    const spec = seedSpec(snapshot);
    let cost: CostContext = {};
    let rule: StageRuleResolution;
    let actionName: string;
    let methodTags: string[];
    let environmentTags: string[];
    let formationMethodId: FormationMethodId | undefined;

    if (nextStage === 'growth') {
      const method = findCultivationMethod(input.actionId);
      if (!method || !method.stages.includes('growth'))
        throw new HerbGardenError('所选方式不能用于蕴养阶段', 400);
      if (method.minGardenLevel > gardenLevel)
        throw new HerbGardenError('当前药圃等级尚未解锁此培育法', 403);
      cost = await payMethodCost(tx, cultivatorId, method.id, input);
      rule = resolveCultivationMethod(spec, method.id, {
        materialElement: cost.material?.element ?? cost.rootElement,
        seedElement: snapshot.element,
      });
      actionName = method.name;
      methodTags = method.methodTags;
      environmentTags = method.environmentTags;
    } else {
      const formation = findFormationMethod(input.actionId);
      if (!formation)
        throw new HerbGardenError('凝华阶段需要选择成型方式', 400);
      formationMethodId = formation.id;
      rule = resolveFormationRule(spec, formation.id);
      actionName = formation.name;
      methodTags = [`formation_${formation.id}`];
      environmentTags = [];
    }

    const record = buildStageRecord({
      stage: nextStage,
      actionId: input.actionId,
      actionName,
      rule,
    });
    const journal = (plot.stageHistory as StoredJournalEntry[] | null) ?? [];
    const history = [...journal, record];
    const nextScore =
      plot.currentScore +
      record.scoreDelta +
      Math.floor((cost.rootStrength ?? 0) / 25);
    const readyAt = new Date(
      Date.now() +
        stageDurationMs(
          nextStage,
          snapshot.rank,
          rule.durationMultiplier,
          spec,
        ),
    );
    let outcome: OutcomeSnapshot | undefined;
    if (formationMethodId) {
      const kind = resolveOutcomeKind(
        spec,
        formationMethodId,
        nextScore,
        Math.random(),
        snapshot.rank,
      );
      const rank = resolveOutcomeQuality(
        snapshot.rank,
        nextScore,
        Math.random(),
      );
      const quantity = resolveOutcomeQuantity(
        kind,
        formationMethodId,
        nextScore,
        Math.random(),
      );
      outcome = fallbackOutcome(
        snapshot,
        kind,
        rank,
        quantity,
        formationMethodId,
        history.filter(isCultivationRecord),
      );
      if (kind === 'spirit_fruit') {
        const settled = resolveSpiritFruitEffects(rank, snapshot.element);
        outcome.spiritFruitSpec = {
          kind: 'spirit_fruit',
          family: settled.family,
          operations: settled.operations,
          consumeRules: {
            scene: 'out_of_battle_only',
            quotaCategory:
              settled.family === 'cultivation' ? 'cultivation' : 'none',
          },
          cultivationMeta: {
            source: 'herb_garden',
            element: snapshot.element,
            tags: ['灵田'],
            sourceSeedName: snapshot.name,
            manifestationTags: history
              .filter(isCultivationRecord)
              .map((entry) => entry.manifestation),
          },
        };
      }
    }
    await tx
      .update(herbGardenPlots)
      .set({
        stage: nextStage,
        stageHistory: history,
        currentScore: nextScore,
        readyAt,
        ...(outcome ? { outcomeSnapshot: outcome } : {}),
      })
      .where(eq(herbGardenPlots.id, plot.id));
    await tx.insert(herbGardenInteractions).values({
      plotId: plot.id,
      ownerId: cultivatorId,
      actorId: cultivatorId,
      action: 'cultivate',
      plantName: plot.seedName,
      payload: { stage: nextStage, actionId: input.actionId },
    });
    return {
      context: {
        plotId: plot.id,
        seed: snapshot,
        spec,
        record,
        rule,
        methodTags,
        environmentTags,
        cost,
      } satisfies NarrativeContext,
      outcome,
    };
  });
  await enrichStageNarrative(result.context);
  if (result.outcome)
    await enrichOutcomeName(
      result.context.plotId,
      result.context.seed,
      result.outcome,
    );
}

async function replaceJournalEntry(
  plotId: string,
  recordId: string,
  replacement: StoredJournalEntry,
): Promise<void> {
  const [plot] = await db
    .select({ history: herbGardenPlots.stageHistory })
    .from(herbGardenPlots)
    .where(eq(herbGardenPlots.id, plotId))
    .limit(1);
  if (!plot) return;
  const history = ((plot.history as StoredJournalEntry[] | null) ?? []).map(
    (entry) => (entry.recordId === recordId ? replacement : entry),
  );
  await db
    .update(herbGardenPlots)
    .set({ stageHistory: history })
    .where(eq(herbGardenPlots.id, plotId));
}

export async function observeHerbGardenPlot(
  cultivatorId: string,
  plotId: string,
  observation: HerbGardenObservationKind,
): Promise<void> {
  const context = await db.transaction(async (tx) => {
    const [plot] = await tx
      .select()
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.id, plotId),
          eq(herbGardenPlots.cultivatorId, cultivatorId),
        ),
      )
      .limit(1)
      .for('update');
    if (!plot) throw new HerbGardenError('这株灵植不在你的灵田中', 404);
    if (plot.stage === 'formation' && plot.readyAt.getTime() <= Date.now())
      throw new HerbGardenError('灵植已经成熟，可直接收获', 409);
    const stage = plot.stage as ActiveHerbGardenStage;
    const history = (plot.stageHistory as StoredJournalEntry[] | null) ?? [];
    const used = history.filter(
      (entry) => isObservationRecord(entry) && entry.stage === stage,
    ).length;
    if (used >= HERB_GARDEN_MAX_OBSERVATIONS_PER_STAGE)
      throw new HerbGardenError('本阶段的辨察次数已用尽', 409);
    const snapshot = plot.seedSnapshot as SeedSnapshot;
    const safeFact = observationSafeFact(seedSpec(snapshot), observation);
    const record: HerbGardenObservationRecord = {
      kind: 'observation',
      recordId: crypto.randomUUID(),
      stage,
      observation,
      observationName: OBSERVATION_NAMES[observation],
      safeFact,
      narrative: safeFact,
      resolvedAt: new Date().toISOString(),
      narrativeSource: 'fallback',
    };
    await tx
      .update(herbGardenPlots)
      .set({ stageHistory: [...history, record] })
      .where(eq(herbGardenPlots.id, plotId));
    return { snapshot, record };
  });
  const narrative = await HerbGardenNarrativeService.narrateObservation({
    seedName: context.snapshot.name,
    seedDescription: context.snapshot.description,
    stage: context.record.stage,
    observationName: context.record.observationName,
    safeFact: context.record.safeFact,
  });
  if (narrative) {
    await replaceJournalEntry(plotId, context.record.recordId, {
      ...context.record,
      narrative,
      narrativeSource: 'llm',
    });
  }
}

export async function consultHerbGardenCaretaker(
  cultivatorId: string,
  plotId: string,
  rawQuestion: string,
): Promise<void> {
  const question = rawQuestion.trim();
  if (question.length < 2 || question.length > 120)
    throw new HerbGardenError('问话需为 2 至 120 个字', 400);
  const context = await db.transaction(async (tx) => {
    const [plot] = await tx
      .select()
      .from(herbGardenPlots)
      .where(
        and(
          eq(herbGardenPlots.id, plotId),
          eq(herbGardenPlots.cultivatorId, cultivatorId),
        ),
      )
      .limit(1)
      .for('update');
    if (!plot) throw new HerbGardenError('这株灵植不在你的灵田中', 404);
    if (plot.stage === 'formation' && plot.readyAt.getTime() <= Date.now())
      throw new HerbGardenError('灵植已经成熟，可直接收获', 409);
    const stage = plot.stage as ActiveHerbGardenStage;
    const history = (plot.stageHistory as StoredJournalEntry[] | null) ?? [];
    const used = history.filter(
      (entry) => isConsultationRecord(entry) && entry.stage === stage,
    ).length;
    if (used >= HERB_GARDEN_MAX_QUESTIONS_PER_STAGE)
      throw new HerbGardenError('本阶段请教次数已用尽', 409);
    const discoveredClues = history
      .filter(isObservationRecord)
      .map((entry) => entry.safeFact);
    const snapshot = plot.seedSnapshot as SeedSnapshot;
    const fallbackReply = discoveredClues.length
      ? `从已见征兆看，${discoveredClues.at(-1)}可先依此线索斟酌，不必急着断定种性。`
      : '此株尚无可依据的草木征兆。可先察叶色、辨灵气，再来问我。';
    const record: HerbGardenConsultationRecord = {
      kind: 'consultation',
      recordId: crypto.randomUUID(),
      stage,
      question,
      reply: fallbackReply,
      resolvedAt: new Date().toISOString(),
      narrativeSource: 'fallback',
    };
    await tx
      .update(herbGardenPlots)
      .set({ stageHistory: [...history, record] })
      .where(eq(herbGardenPlots.id, plotId));
    return { snapshot, record, discoveredClues };
  });
  if (!context.discoveredClues.length) return;
  const reply = await HerbGardenNarrativeService.answerConsultation({
    seedName: context.snapshot.name,
    seedDescription: context.snapshot.description,
    stage: context.record.stage,
    question,
    discoveredClues: context.discoveredClues,
  });
  if (reply) {
    await replaceJournalEntry(plotId, context.record.recordId, {
      ...context.record,
      reply,
      narrativeSource: 'llm',
    });
  }
}

async function awardOutcome(
  tx: DbTransaction,
  cultivatorId: string,
  outcome: OutcomeSnapshot,
  quantity: number,
  element?: ElementType,
) {
  if (outcome.kind === 'spirit_fruit') {
    const settled = resolveSpiritFruitEffects(outcome.rank, element);
    const spec: SpiritFruitSpec = outcome.spiritFruitSpec ?? {
      kind: 'spirit_fruit',
      family: settled.family,
      operations: settled.operations,
      consumeRules: {
        scene: 'out_of_battle_only',
        quotaCategory:
          settled.family === 'cultivation' ? 'cultivation' : 'none',
      },
      cultivationMeta: {
        source: 'herb_garden',
        element,
        tags: ['灵田'],
        sourceSeedName: outcome.cultivation.sourceSeedName,
        manifestationTags: outcome.cultivation.manifestationTags,
      },
    };
    const value = Math.max(20, (QUALITY_ORDER.indexOf(outcome.rank) + 1) * 35);
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
        description: outcome.description,
        score: value,
        spec,
      });
    return;
  }
  await addMaterialStackToInventory(
    cultivatorId,
    {
      name: outcome.name,
      type: outcome.kind === 'tcdb' ? 'tcdb' : 'herb',
      rank: outcome.rank,
      element,
      description: outcome.description,
      details: {
        source: 'sect_herb_garden',
        cultivation: outcome.cultivation,
      },
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
    const outcome = plot.outcomeSnapshot as OutcomeSnapshot | null;
    if (!outcome)
      throw new HerbGardenError('灵植成型记录缺失，请稍后再试', 500);
    const remaining =
      plot.remainingYield > 0 ? plot.remainingYield : outcome.quantity;
    await awardOutcome(
      tx,
      cultivatorId,
      outcome,
      remaining,
      (plot.seedElement ?? undefined) as ElementType | undefined,
    );
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
    return {
      name: outcome.name,
      description: outcome.description,
      kind: outcome.kind,
      rank: outcome.rank,
      quantity: remaining,
    };
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
    const outcome = plot.outcomeSnapshot as OutcomeSnapshot | null;
    if (!outcome) throw new HerbGardenError('灵植成型记录缺失', 500);
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
        ? `${actorName}来访时采走了「${row.plantName}」一份。`
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
  const owner = await assertActiveCultivator(ownerId);
  await ensureGardenInitialized(ownerId);
  const isSelf = viewerId === ownerId;
  const [
    profiles,
    rows,
    logs,
    gardenLevel,
    seeds,
    methodMaterials,
    roots,
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
            description: materials.description,
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
            element: materials.element,
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
    isSelf
      ? db
          .select({
            element: spiritualRoots.element,
            strength: spiritualRoots.strength,
          })
          .from(spiritualRoots)
          .where(eq(spiritualRoots.cultivatorId, ownerId))
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
      description: snapshot.description,
      plantedAt: row.plantedAt.toISOString(),
      readyAt: row.readyAt.toISOString(),
      history: isSelf
        ? ((row.stageHistory as StoredJournalEntry[] | null) ?? [])
        : undefined,
      observationAllowance: isSelf
        ? {
            used: (
              (row.stageHistory as StoredJournalEntry[] | null) ?? []
            ).filter(
              (entry) => isObservationRecord(entry) && entry.stage === stage,
            ).length,
            limit: HERB_GARDEN_MAX_OBSERVATIONS_PER_STAGE,
          }
        : undefined,
      questionAllowance: isSelf
        ? {
            used: (
              (row.stageHistory as StoredJournalEntry[] | null) ?? []
            ).filter(
              (entry) => isConsultationRecord(entry) && entry.stage === stage,
            ).length,
            limit: HERB_GARDEN_MAX_QUESTIONS_PER_STAGE,
          }
        : undefined,
      outcomePreview:
        ready && outcome
          ? {
              name: outcome.name,
              kind: outcome.kind,
              rank: outcome.rank,
              operations: outcome.spiritFruitSpec?.operations,
            }
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
  const maxSeedQuality = getHerbGardenMaxSeedQuality(owner.realm);
  const seedViews = seeds.flatMap((seed) => {
    const details = readSpiritSeedDetails(seed.details);
    if (!details) return [];
    const rank = seed.rank as Quality;
    const plantable = canCultivateSeedQuality(owner.realm, rank);
    return [
      {
        materialId: seed.id,
        name: seed.name,
        rank,
        element: (seed.element ?? undefined) as ElementType | undefined,
        description: seed.description ?? undefined,
        fingerprint: details.fingerprint,
        quantity: seed.quantity,
        plantable,
        lockedReason: plantable
          ? undefined
          : `当前${owner.realm}最高可育${maxSeedQuality}灵种`,
      },
    ];
  });
  return {
    owner: { cultivatorId: ownerId, name: owner.name, isSelf },
    gardenLevel,
    progression: { realm: owner.realm, maxSeedQuality },
    methods: CULTIVATION_METHODS.filter(
      (method) => method.minGardenLevel <= gardenLevel,
    ),
    formationMethods: [...FORMATION_METHODS],
    plots,
    seeds: seedViews,
    methodMaterials: methodMaterials.map((material) => ({
      materialId: material.id,
      name: material.name,
      type: material.type as Exclude<MaterialType, 'seed'>,
      rank: material.rank as Quality,
      element: (material.element ?? undefined) as ElementType | undefined,
      quantity: material.quantity,
    })),
    spiritualRoots: roots.map((root) => ({
      element: root.element as ElementType,
      strength: root.strength,
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
