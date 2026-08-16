import type { CreationMaterialSemanticTag } from '@shared/engine/shared/tag-domain';
import { CreationTags } from '@shared/engine/shared/tag-domain';
import {
  QUALITY_ORDER,
  type ElementType,
  type MaterialType,
  type Quality,
  type RealmType,
} from '@shared/types/constants';
import type { ConditionOperation, PillFamily } from '@shared/types/consumable';

export const HERB_GARDEN_PLOT_COUNT = 6;
export const HERB_GARDEN_MAX_HELPERS = 3;
export const HERB_GARDEN_MAX_STEAL_RATIO = 0.2;
export const HERB_GARDEN_MAX_OBSERVATIONS_PER_STAGE = 2;
export const HERB_GARDEN_MAX_QUESTIONS_PER_STAGE = 2;
export const SPIRIT_SEED_SPEC_KEY = 'seedSpec';
export const HIDDEN_SPIRIT_SEED_KEY = '__serverHiddenSpiritSeed';

export const HERB_GARDEN_STAGE_VALUES = [
  'germination',
  'growth',
  'formation',
  'ready',
] as const;
export type HerbGardenStage = (typeof HERB_GARDEN_STAGE_VALUES)[number];
export type ActiveHerbGardenStage = Exclude<HerbGardenStage, 'ready'>;

export const HERB_GARDEN_OBSERVATION_VALUES = [
  'appearance',
  'aura',
  'soil',
  'root',
] as const;
export type HerbGardenObservationKind =
  (typeof HERB_GARDEN_OBSERVATION_VALUES)[number];

const REALM_SEED_QUALITY_CAP: Record<RealmType, Quality> = {
  炼气: '灵品',
  筑基: '玄品',
  金丹: '真品',
  元婴: '地品',
  化神: '天品',
  炼虚: '仙品',
  合体: '神品',
  大乘: '神品',
  渡劫: '神品',
};

export function getHerbGardenMaxSeedQuality(realm: RealmType): Quality {
  return REALM_SEED_QUALITY_CAP[realm];
}

export function canCultivateSeedQuality(
  realm: RealmType,
  quality: Quality,
): boolean {
  return (
    QUALITY_ORDER[quality] <= QUALITY_ORDER[getHerbGardenMaxSeedQuality(realm)]
  );
}

export const SPIRIT_PLANTING_METHOD_TAG_VALUES = [
  'slow_nurture',
  'qi_acceleration',
  'spirit_stone_stabilization',
  'root_resonance',
  'herb_companion',
  'ore_soil',
  'monster_blood',
  'aux_formation',
  'pill_nourishment',
  'tcdb_catalysis',
] as const;
export type SpiritPlantingMethodTag =
  (typeof SPIRIT_PLANTING_METHOD_TAG_VALUES)[number];

export const SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES = [
  'balanced_soil',
  'sunlit_dry',
  'shaded_cool',
  'moist_watered',
  'qi_dense',
  'mineral_rich',
  'wind_exposed',
  'thunder_charged',
] as const;
export type SpiritPlantingEnvironmentTag =
  (typeof SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES)[number];

export const SPIRIT_PLANT_GROWTH_TRAIT_TAG_VALUES = [
  'slow_germination',
  'rapid_growth',
  'deep_rooted',
  'delicate_root',
  'qi_devouring',
  'purity_sensitive',
  'mutation_prone',
  'fruiting',
  'medicinal_condensing',
  'treasure_transforming',
] as const;
export type SpiritPlantGrowthTraitTag =
  (typeof SPIRIT_PLANT_GROWTH_TRAIT_TAG_VALUES)[number];

export const SPIRIT_SEED_OUTCOME_BIAS_VALUES = [
  'herb',
  'spirit_fruit',
  'tcdb',
] as const;
export type SpiritSeedOutcomeBias =
  (typeof SPIRIT_SEED_OUTCOME_BIAS_VALUES)[number];

export interface SpiritSeedSpec {
  preferredMethodTags: SpiritPlantingMethodTag[];
  avoidedMethodTags: SpiritPlantingMethodTag[];
  preferredEnvironmentTags: SpiritPlantingEnvironmentTag[];
  avoidedEnvironmentTags: SpiritPlantingEnvironmentTag[];
  growthTraitTags: SpiritPlantGrowthTraitTag[];
  outcomeBiases: SpiritSeedOutcomeBias[];
  semanticTags: CreationMaterialSemanticTag[];
}

export type SpiritSeedSource =
  | 'dungeon'
  | 'daily_yield'
  | 'market'
  | 'sect_treasury'
  | 'harvest'
  | 'starter';

export interface LegacySpiritSeedHiddenSpec {
  version: 1;
  preferredTags: string[];
  avoidedTags: string[];
  vigor: number;
  outputBias: { herb: number; spiritFruit: number; treasure: number };
}

export interface SpiritSeedDetails {
  [key: string]: unknown;
  kind: 'spirit_seed';
  version: 1;
  fingerprint: string;
  source?: SpiritSeedSource;
  seedSpec?: SpiritSeedSpec;
  /** 仅兼容未部署草稿产生的数据；新数据统一写入 seedSpec。 */
  [HIDDEN_SPIRIT_SEED_KEY]?: LegacySpiritSeedHiddenSpec;
}

const FALLBACK_SEMANTIC_TAGS = [
  CreationTags.MATERIAL.SEMANTIC_LIFE,
  CreationTags.MATERIAL.SEMANTIC_ALCHEMY,
  CreationTags.MATERIAL.SEMANTIC_QI,
] as const;

function createSeededRandom(seed: string): () => number {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

function shuffledBy<T>(values: readonly T[], next: () => number): T[] {
  return [...values]
    .map((value) => ({ value, order: next() }))
    .sort((left, right) => left.order - right.order)
    .map((entry) => entry.value);
}

export function createSpiritSeedDetails(
  entropy: string,
  source?: SpiritSeedSource,
  generatedSpec?: SpiritSeedSpec,
): SpiritSeedDetails {
  const next = createSeededRandom(entropy);
  const methods = shuffledBy(SPIRIT_PLANTING_METHOD_TAG_VALUES, next);
  const environments = shuffledBy(SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES, next);
  const traits = shuffledBy(SPIRIT_PLANT_GROWTH_TRAIT_TAG_VALUES, next);
  const outcomes = shuffledBy(SPIRIT_SEED_OUTCOME_BIAS_VALUES, next);
  const semantics = shuffledBy(FALLBACK_SEMANTIC_TAGS, next);
  const fingerprint = Math.floor(next() * 2_176_782_336)
    .toString(36)
    .padStart(7, '0')
    .slice(0, 7);
  return {
    kind: 'spirit_seed',
    version: 1,
    fingerprint,
    ...(source ? { source } : {}),
    seedSpec: generatedSpec ?? {
      preferredMethodTags: methods.slice(0, 2),
      avoidedMethodTags: methods.slice(2, 3),
      preferredEnvironmentTags: environments.slice(0, 2),
      avoidedEnvironmentTags: environments.slice(2, 3),
      growthTraitTags: traits.slice(0, 3),
      outcomeBiases: outcomes.slice(0, 2),
      semanticTags: semantics.slice(0, 2),
    },
  };
}

export function withSpiritSeedSource(
  details: SpiritSeedDetails,
  source?: SpiritSeedSource,
): SpiritSeedDetails {
  return source ? { ...details, source } : details;
}

export function readSpiritSeedDetails(
  value: unknown,
): SpiritSeedDetails | null {
  if (!value || typeof value !== 'object') return null;
  const details = value as Record<string, unknown>;
  if (
    details.kind !== 'spirit_seed' ||
    details.version !== 1 ||
    typeof details.fingerprint !== 'string'
  )
    return null;
  return details as SpiritSeedDetails;
}

export function readSpiritSeedSpec(value: unknown): SpiritSeedSpec | null {
  const details = readSpiritSeedDetails(value);
  if (!details) return null;
  if (details.seedSpec) return details.seedSpec;
  const legacy = details[HIDDEN_SPIRIT_SEED_KEY];
  if (!legacy) return null;
  const mapLegacy = (tag: string): SpiritPlantingMethodTag | null => {
    const mapping: Record<string, SpiritPlantingMethodTag> = {
      gentle: 'slow_nurture',
      abundant_qi: 'qi_acceleration',
      stable: 'spirit_stone_stabilization',
      resonant: 'root_resonance',
      woodland: 'herb_companion',
      mineral: 'ore_soil',
      bloodline: 'monster_blood',
      formation: 'aux_formation',
    };
    return mapping[tag] ?? null;
  };
  return {
    preferredMethodTags: legacy.preferredTags.flatMap((tag) => {
      const mapped = mapLegacy(tag);
      return mapped ? [mapped] : [];
    }),
    avoidedMethodTags: legacy.avoidedTags.flatMap((tag) => {
      const mapped = mapLegacy(tag);
      return mapped ? [mapped] : [];
    }),
    preferredEnvironmentTags: ['balanced_soil'],
    avoidedEnvironmentTags: [],
    growthTraitTags: ['medicinal_condensing'],
    outcomeBiases:
      legacy.outputBias.spiritFruit > legacy.outputBias.treasure
        ? ['herb', 'spirit_fruit']
        : ['herb', 'tcdb'],
    semanticTags: [CreationTags.MATERIAL.SEMANTIC_LIFE],
  };
}

export const CULTIVATION_METHOD_VALUES = [
  'slow_nurture',
  'qi_acceleration',
  'spirit_stone_stabilization',
  'sunlit_awakening',
  'shade_dew',
  'root_resonance',
  'herb_companion',
  'ore_soil',
  'monster_blood',
  'aux_formation',
] as const;
export type CultivationMethodId = (typeof CULTIVATION_METHOD_VALUES)[number];

export type CultivationCost =
  | { kind: 'time' }
  | { kind: 'qi'; amount: number }
  | { kind: 'spirit_stones'; amount: number }
  | { kind: 'mp'; amount: number }
  | {
      kind: 'material';
      materialType: Exclude<MaterialType, 'seed'>;
      amount: number;
      spiritStones?: number;
    };

export interface CultivationMethodDefinition {
  id: CultivationMethodId;
  name: string;
  description: string;
  stages: Array<'germination' | 'growth'>;
  methodTags: SpiritPlantingMethodTag[];
  environmentTags: SpiritPlantingEnvironmentTag[];
  minGardenLevel: number;
  cost: CultivationCost;
  requiresRoot?: boolean;
}

export const CULTIVATION_METHODS: readonly CultivationMethodDefinition[] = [
  {
    id: 'slow_nurture',
    name: '顺时温养',
    description: '循草木时序温养，不额外耗费资源。',
    stages: ['germination', 'growth'],
    methodTags: ['slow_nurture'],
    environmentTags: ['balanced_soil'],
    minGardenLevel: 1,
    cost: { kind: 'time' },
  },
  {
    id: 'qi_acceleration',
    name: '天地灵气催生',
    description: '引天地灵气催动生机，能缩短本阶段时长。',
    stages: ['germination', 'growth'],
    methodTags: ['qi_acceleration'],
    environmentTags: ['qi_dense'],
    minGardenLevel: 1,
    cost: { kind: 'qi', amount: 20 },
  },
  {
    id: 'spirit_stone_stabilization',
    name: '灵石固壤',
    description: '以灵石稳住土中灵机，使萌芽少生偏差。',
    stages: ['germination'],
    methodTags: ['spirit_stone_stabilization'],
    environmentTags: ['qi_dense'],
    minGardenLevel: 1,
    cost: { kind: 'spirit_stones', amount: 100 },
  },
  {
    id: 'sunlit_awakening',
    name: '向阳醒种',
    description: '借日照与干暖土性唤醒种中生机。',
    stages: ['germination'],
    methodTags: ['slow_nurture'],
    environmentTags: ['sunlit_dry'],
    minGardenLevel: 2,
    cost: { kind: 'time' },
  },
  {
    id: 'shade_dew',
    name: '荫棚集露',
    description: '遮去烈日，以清凉水汽润开籽壳。',
    stages: ['germination'],
    methodTags: ['slow_nurture'],
    environmentTags: ['shaded_cool', 'moist_watered'],
    minGardenLevel: 2,
    cost: { kind: 'time' },
  },
  {
    id: 'ore_soil',
    name: '矿砂改土',
    description: '投入一份矿石，以其材性改变根系所依土壤。',
    stages: ['germination'],
    methodTags: ['ore_soil'],
    environmentTags: ['mineral_rich'],
    minGardenLevel: 2,
    cost: { kind: 'material', materialType: 'ore', amount: 1 },
  },
  {
    id: 'root_resonance',
    name: '本命灵力灌注',
    description: '选择自身灵根，消耗法力与灵植共鸣。',
    stages: ['growth'],
    methodTags: ['root_resonance'],
    environmentTags: ['qi_dense'],
    minGardenLevel: 3,
    cost: { kind: 'mp', amount: 20 },
    requiresRoot: true,
  },
  {
    id: 'herb_companion',
    name: '药材伴养',
    description: '投入一份药材，引导幼株吸纳相近药性。',
    stages: ['growth'],
    methodTags: ['herb_companion'],
    environmentTags: ['balanced_soil'],
    minGardenLevel: 3,
    cost: { kind: 'material', materialType: 'herb', amount: 1 },
  },
  {
    id: 'monster_blood',
    name: '妖血沃根',
    description: '投入一份妖兽材料，激发旺盛而不稳定的生机。',
    stages: ['growth'],
    methodTags: ['monster_blood'],
    environmentTags: ['balanced_soil'],
    minGardenLevel: 3,
    cost: { kind: 'material', materialType: 'monster', amount: 1 },
  },
  {
    id: 'aux_formation',
    name: '辅材布阵',
    description: '以辅材和灵石在畦旁布下聚灵小阵。',
    stages: ['germination', 'growth'],
    methodTags: ['aux_formation'],
    environmentTags: ['qi_dense'],
    minGardenLevel: 4,
    cost: {
      kind: 'material',
      materialType: 'aux',
      amount: 1,
      spiritStones: 50,
    },
  },
] as const;

export const FORMATION_METHOD_VALUES = [
  'leaf_medicine',
  'fruit_bloom',
  'treasure_return',
  'natural_form',
] as const;
export type FormationMethodId = (typeof FORMATION_METHOD_VALUES)[number];

export interface FormationMethodDefinition {
  id: FormationMethodId;
  name: string;
  description: string;
  outcomeBias?: SpiritSeedOutcomeBias;
}

export const FORMATION_METHODS: readonly FormationMethodDefinition[] = [
  {
    id: 'leaf_medicine',
    name: '凝叶成药',
    description: '引导药性归入枝叶，成型稳定，产量较高。',
    outcomeBias: 'herb',
  },
  {
    id: 'fruit_bloom',
    name: '开花结果',
    description: '引导灵机结为可服用灵果，成败取决于此前长势。',
    outcomeBias: 'spirit_fruit',
  },
  {
    id: 'treasure_return',
    name: '返源化宝',
    description: '尝试将草木精华凝成天材地宝，对品质和长势要求最高。',
    outcomeBias: 'tcdb',
  },
  {
    id: 'natural_form',
    name: '顺势化形',
    description: '不强定形态，由种子隐藏天性自行成型。',
  },
] as const;

export type HerbGardenActionId = CultivationMethodId | FormationMethodId;
export const HERB_GARDEN_ACTION_VALUES = [
  ...CULTIVATION_METHOD_VALUES,
  ...FORMATION_METHOD_VALUES,
] as const;

export function findCultivationMethod(
  id: string,
): CultivationMethodDefinition | undefined {
  return CULTIVATION_METHODS.find((method) => method.id === id);
}

export function findFormationMethod(
  id: string,
): FormationMethodDefinition | undefined {
  return FORMATION_METHODS.find((method) => method.id === id);
}

export function nextHerbGardenStage(stage: HerbGardenStage): HerbGardenStage {
  if (stage === 'germination') return 'growth';
  if (stage === 'growth') return 'formation';
  return 'ready';
}

export const STAGE_ASSESSMENT_VALUES = [
  'resonant',
  'aligned',
  'neutral',
  'conflict',
] as const;
export type StageAssessment = (typeof STAGE_ASSESSMENT_VALUES)[number];

export interface StageRuleResolution {
  ruleScore: number;
  scoreDelta: number;
  durationMultiplier: number;
  allowedAssessments: StageAssessment[];
  fallbackAssessment: StageAssessment;
  fallbackHint: string;
  fallbackNarrative: string;
}

function fallbackStageCopy(assessment: StageAssessment) {
  switch (assessment) {
    case 'resonant':
      return {
        hint: '幼叶舒展，灵纹随所施之法缓缓亮起。',
        narrative: '草木灵机与此法彼此呼应，根叶间生出清润光泽。',
      };
    case 'aligned':
      return {
        hint: '根须安稳扎入土中，气息渐趋匀净。',
        narrative: '这轮照料顺应了灵植长势，虽无异象，生机却更显稳固。',
      };
    case 'conflict':
      return {
        hint: '根须短暂蜷缩，叶缘也失了几分润色。',
        narrative: '所施之法与种性相冲，灵机虽未断绝，运转却明显滞涩。',
      };
    case 'neutral':
      return {
        hint: '枝叶未显偏转，只按原有时序缓慢生长。',
        narrative: '灵植平稳承受了本轮培育，暂时看不出明显喜恶。',
      };
  }
}

export function resolveCultivationMethod(
  spec: SpiritSeedSpec,
  methodId: CultivationMethodId,
  input: { materialElement?: ElementType; seedElement?: ElementType } = {},
): StageRuleResolution {
  const method = findCultivationMethod(methodId);
  if (!method) throw new Error('未知培育法');
  let ruleScore = 0;
  for (const tag of method.methodTags) {
    if (spec.preferredMethodTags.includes(tag)) ruleScore += 2;
    if (spec.avoidedMethodTags.includes(tag)) ruleScore -= 2;
  }
  for (const tag of method.environmentTags) {
    if (spec.preferredEnvironmentTags.includes(tag)) ruleScore += 1;
    if (spec.avoidedEnvironmentTags.includes(tag)) ruleScore -= 1;
  }
  if (
    input.materialElement &&
    input.seedElement &&
    input.materialElement === input.seedElement
  )
    ruleScore += 1;
  const allowedAssessments: StageAssessment[] =
    ruleScore >= 3
      ? ['resonant', 'aligned']
      : ruleScore >= 0
        ? ['aligned', 'neutral']
        : ['neutral', 'conflict'];
  const fallbackAssessment =
    ruleScore >= 3 ? 'resonant' : ruleScore >= 0 ? 'aligned' : 'conflict';
  const fallback = fallbackStageCopy(fallbackAssessment);
  return {
    ruleScore,
    scoreDelta: Math.max(-12, Math.min(24, ruleScore * 6 + 6)),
    durationMultiplier:
      methodId === 'qi_acceleration'
        ? 0.7
        : ruleScore < 0
          ? 1.12
          : ruleScore >= 3
            ? 0.9
            : 1,
    allowedAssessments,
    fallbackAssessment,
    fallbackHint: fallback.hint,
    fallbackNarrative: fallback.narrative,
  };
}

export type HerbGardenOutcomeKind = 'herb' | 'spirit_fruit' | 'tcdb';

const OUTCOME_QUALITY_ORDER: readonly Quality[] = [
  '凡品',
  '灵品',
  '玄品',
  '真品',
  '地品',
  '天品',
  '仙品',
  '神品',
];

export function resolveOutcomeKind(
  spec: SpiritSeedSpec,
  formationMethodId: FormationMethodId,
  score: number,
  roll: number,
  seedRank: Quality = '凡品',
): HerbGardenOutcomeKind {
  if (formationMethodId === 'leaf_medicine') return 'herb';
  if (formationMethodId === 'fruit_bloom') {
    const chance = Math.max(
      0.35,
      Math.min(
        0.9,
        0.52 +
          score / 240 +
          (spec.outcomeBiases.includes('spirit_fruit') ? 0.15 : 0),
      ),
    );
    return roll < chance ? 'spirit_fruit' : 'herb';
  }
  if (formationMethodId === 'treasure_return') {
    const qualityIndex = OUTCOME_QUALITY_ORDER.indexOf(seedRank);
    const chance = Math.max(
      0.05,
      Math.min(
        0.72,
        0.08 +
          qualityIndex * 0.06 +
          score / 260 +
          (spec.outcomeBiases.includes('tcdb') ? 0.16 : 0),
      ),
    );
    return qualityIndex >= 2 && roll < chance ? 'tcdb' : 'herb';
  }
  if (
    spec.outcomeBiases.includes('tcdb') &&
    roll < Math.max(0.04, Math.min(0.25, score / 400))
  )
    return 'tcdb';
  if (
    spec.outcomeBiases.includes('spirit_fruit') &&
    roll < Math.max(0.22, Math.min(0.65, 0.28 + score / 260))
  )
    return 'spirit_fruit';
  return 'herb';
}

export function resolveOutcomeQuality(
  seedRank: Quality,
  score: number,
  roll: number,
): Quality {
  const index = OUTCOME_QUALITY_ORDER.indexOf(seedRank);
  const riseChance = Math.max(0, Math.min(0.28, (score - 24) / 220));
  const fallChance = Math.max(0, Math.min(0.24, (18 - score) / 120));
  if (roll < riseChance)
    return OUTCOME_QUALITY_ORDER[
      Math.min(OUTCOME_QUALITY_ORDER.length - 1, index + 1)
    ];
  if (roll > 1 - fallChance)
    return OUTCOME_QUALITY_ORDER[Math.max(0, index - 1)];
  return seedRank;
}

export function resolveOutcomeQuantity(
  kind: HerbGardenOutcomeKind,
  formationMethodId: FormationMethodId,
  score: number,
  roll: number,
): number {
  const scoreBonus = score >= 54 ? 1 : 0;
  if (kind === 'tcdb') return 1 + (score >= 72 && roll < 0.28 ? 1 : 0);
  if (kind === 'spirit_fruit') {
    const base = formationMethodId === 'fruit_bloom' ? 2 : 1;
    return Math.min(5, base + Math.floor(roll * 3) + scoreBonus);
  }
  if (formationMethodId === 'leaf_medicine')
    return Math.min(11, 7 + Math.floor(roll * 3) + scoreBonus);
  if (
    formationMethodId === 'fruit_bloom' ||
    formationMethodId === 'treasure_return'
  )
    return Math.min(6, 3 + Math.floor(roll * 2) + scoreBonus);
  return Math.min(9, 5 + Math.floor(roll * 3) + scoreBonus);
}

export function resolveSpiritFruitEffects(
  rank: Quality,
  element?: ElementType,
): { family: PillFamily; operations: ConditionOperation[] } {
  const tier = QUALITY_ORDER[rank] + 1;
  const cultivation: ConditionOperation = {
    type: 'gain_progress',
    target: 'cultivation_exp',
    value: 18 + tier * 18,
  };
  if (element === '水' || element === '冰')
    return {
      family: 'mana',
      operations: [
        {
          type: 'restore_resource',
          resource: 'mp',
          mode: 'percent',
          value: Math.min(0.3, 0.06 + tier * 0.03),
        },
        cultivation,
      ],
    };
  if (element === '木' || element === '土')
    return {
      family: 'healing',
      operations: [
        {
          type: 'restore_resource',
          resource: 'hp',
          mode: 'percent',
          value: Math.min(0.3, 0.06 + tier * 0.03),
        },
        cultivation,
      ],
    };
  if (element === '风' || element === '雷')
    return {
      family: 'insight',
      operations: [
        {
          type: 'gain_progress',
          target: 'comprehension_insight',
          value: 1 + Math.floor(tier / 2),
        },
        cultivation,
      ],
    };
  return { family: 'cultivation', operations: [cultivation] };
}

export interface HerbGardenSeedStack {
  materialId: string;
  name: string;
  rank: Quality;
  element?: ElementType;
  description?: string;
  fingerprint: string;
  quantity: number;
  plantable: boolean;
  lockedReason?: string;
}

export type HerbGardenPlotStatus =
  'empty' | 'cultivating' | 'awaiting_action' | 'ready';

export interface HerbGardenStageRecord {
  kind?: 'cultivation';
  recordId: string;
  stage: ActiveHerbGardenStage;
  actionId: HerbGardenActionId;
  actionName: string;
  assessment: StageAssessment;
  manifestation: string;
  discoveredHint: string;
  narrative: string;
  resolvedAt: string;
  narrativeSource: 'llm' | 'fallback';
}

export interface HerbGardenObservationRecord {
  kind: 'observation';
  recordId: string;
  stage: ActiveHerbGardenStage;
  observation: HerbGardenObservationKind;
  observationName: string;
  safeFact: string;
  narrative: string;
  resolvedAt: string;
  narrativeSource: 'llm' | 'fallback';
}

export interface HerbGardenConsultationRecord {
  kind: 'consultation';
  recordId: string;
  stage: ActiveHerbGardenStage;
  question: string;
  reply: string;
  resolvedAt: string;
  narrativeSource: 'llm' | 'fallback';
}

export type HerbGardenJournalEntry =
  | HerbGardenStageRecord
  | HerbGardenObservationRecord
  | HerbGardenConsultationRecord;

export interface HerbGardenPlotView {
  slot: number;
  plotId?: string;
  status: HerbGardenPlotStatus;
  stage?: HerbGardenStage;
  seedName?: string;
  seedRank?: Quality;
  element?: ElementType;
  description?: string;
  plantedAt?: string;
  readyAt?: string;
  history?: HerbGardenJournalEntry[];
  observationAllowance?: { used: number; limit: number };
  questionAllowance?: { used: number; limit: number };
  outcomePreview?: {
    name: string;
    kind: HerbGardenOutcomeKind;
    rank: Quality;
    operations?: ConditionOperation[];
  };
  remainingYield?: number;
  stealLimit?: number;
  stolenCount?: number;
  helperCount?: number;
  canHelp?: boolean;
  canSteal?: boolean;
  alreadyHelped?: boolean;
  alreadyStolen?: boolean;
}

export interface HerbGardenLogView {
  id: string;
  action: 'plant' | 'cultivate' | 'harvest' | 'help' | 'steal';
  actorId: string;
  actorName: string;
  ownerId: string;
  plantName: string;
  message: string;
  createdAt: string;
}

export interface HerbGardenFriendView {
  cultivatorId: string;
  name: string;
  realm: string;
  readyPlots: number;
  growingPlots: number;
  canVisit: boolean;
}

export interface HerbGardenState {
  owner: { cultivatorId: string; name: string; isSelf: boolean };
  gardenLevel: number;
  progression: { realm: RealmType; maxSeedQuality: Quality };
  methods: CultivationMethodDefinition[];
  formationMethods: FormationMethodDefinition[];
  plots: HerbGardenPlotView[];
  seeds: HerbGardenSeedStack[];
  methodMaterials: Array<{
    materialId: string;
    name: string;
    type: Exclude<MaterialType, 'seed'>;
    rank: Quality;
    element?: ElementType;
    quantity: number;
  }>;
  spiritualRoots: Array<{ element: ElementType; strength: number }>;
  logs: HerbGardenLogView[];
  friends: HerbGardenFriendView[];
  summary: {
    planted: number;
    awaitingAction: number;
    ready: number;
    totalHarvests: number;
  };
}

export interface HerbGardenHarvestResult {
  name: string;
  description: string;
  kind: HerbGardenOutcomeKind;
  rank: Quality;
  quantity: number;
}
