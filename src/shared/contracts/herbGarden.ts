import type {
  ElementType,
  MaterialType,
  Quality,
} from '@shared/types/constants';

export const HERB_GARDEN_PLOT_COUNT = 6;
export const HERB_GARDEN_MAX_HELPERS = 3;
export const HERB_GARDEN_MAX_STEAL_RATIO = 0.2;
export const HIDDEN_SPIRIT_SEED_KEY = '__serverHiddenSpiritSeed';

export const HERB_GARDEN_STAGE_VALUES = [
  'germination',
  'growth',
  'formation',
  'ready',
] as const;
export type HerbGardenStage = (typeof HERB_GARDEN_STAGE_VALUES)[number];

export const CULTIVATION_METHOD_VALUES = [
  'slow_nurture',
  'qi_acceleration',
  'spirit_stone_stabilize',
  'root_resonance',
  'herb_companion',
  'ore_soil',
  'monster_blood',
  'aux_formation',
] as const;
export type CultivationMethodId = (typeof CULTIVATION_METHOD_VALUES)[number];
export type SpiritSeedTag =
  | 'gentle'
  | 'abundant_qi'
  | 'stable'
  | 'resonant'
  | 'woodland'
  | 'mineral'
  | 'bloodline'
  | 'formation';

export interface CultivationMethodDefinition {
  id: CultivationMethodId;
  name: string;
  description: string;
  tag: SpiritSeedTag;
  minGardenLevel: number;
  materialType?: Exclude<MaterialType, 'seed'>;
}

export const CULTIVATION_METHODS: readonly CultivationMethodDefinition[] = [
  {
    id: 'slow_nurture',
    name: '温养守候',
    description: '不额外耗材，稳妥等待草木自行吐纳。',
    tag: 'gentle',
    minGardenLevel: 1,
  },
  {
    id: 'qi_acceleration',
    name: '引气催生',
    description: '以天地灵气催动生机，缩短本阶段等待。',
    tag: 'abundant_qi',
    minGardenLevel: 1,
  },
  {
    id: 'spirit_stone_stabilize',
    name: '灵石镇壤',
    description: '以灵石稳定土中灵机，降低偏差。',
    tag: 'stable',
    minGardenLevel: 1,
  },
  {
    id: 'root_resonance',
    name: '灵根共鸣',
    description: '以自身灵根与种性相和。',
    tag: 'resonant',
    minGardenLevel: 2,
  },
  {
    id: 'herb_companion',
    name: '灵药伴生',
    description: '投入一份灵药，引导草木方向。',
    tag: 'woodland',
    minGardenLevel: 2,
    materialType: 'herb',
  },
  {
    id: 'ore_soil',
    name: '灵矿沃土',
    description: '投入一份矿石，改变根系所依土性。',
    tag: 'mineral',
    minGardenLevel: 3,
    materialType: 'ore',
  },
  {
    id: 'monster_blood',
    name: '妖血灌育',
    description: '投入一份妖兽材料，激发异质血性。',
    tag: 'bloodline',
    minGardenLevel: 3,
    materialType: 'monster',
  },
  {
    id: 'aux_formation',
    name: '辅材布阵',
    description: '投入一份辅材，在灵畦周围布下小阵。',
    tag: 'formation',
    minGardenLevel: 4,
    materialType: 'aux',
  },
] as const;

export interface SpiritSeedHiddenSpec {
  version: 1;
  preferredTags: SpiritSeedTag[];
  avoidedTags: SpiritSeedTag[];
  vigor: number;
  outputBias: { herb: number; spiritFruit: number; treasure: number };
}

export interface SpiritSeedPublicDetails {
  [key: string]: unknown;
  kind: 'spirit_seed';
  version: 1;
  fingerprint: string;
  hint: string;
  source?:
    | 'dungeon'
    | 'daily_yield'
    | 'market'
    | 'sect_treasury'
    | 'harvest'
    | 'starter';
  [HIDDEN_SPIRIT_SEED_KEY]?: SpiritSeedHiddenSpec;
}

const SEED_TAGS: readonly SpiritSeedTag[] = [
  'gentle',
  'abundant_qi',
  'stable',
  'resonant',
  'woodland',
  'mineral',
  'bloodline',
  'formation',
];

export function createSpiritSeedDetails(
  seed: string,
  source?: SpiritSeedPublicDetails['source'],
): SpiritSeedPublicDetails {
  let state = 2166136261;
  for (const char of seed) {
    state ^= char.charCodeAt(0);
    state = Math.imul(state, 16777619);
  }
  const next = () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
  const shuffled = [...SEED_TAGS].sort(() => next() - 0.5);
  const vigor = Math.round((0.75 + next() * 0.5) * 100) / 100;
  const raw = {
    herb: 0.55 + next() * 0.35,
    spiritFruit: 0.08 + next() * 0.2,
    treasure: 0.01 + next() * 0.08,
  };
  const total = raw.herb + raw.spiritFruit + raw.treasure;
  let publicState = 2166136261;
  for (const char of `public:${seed}`) {
    publicState ^= char.charCodeAt(0);
    publicState = Math.imul(publicState, 16777619);
  }
  const fingerprint = (publicState >>> 0)
    .toString(36)
    .padStart(7, '0')
    .slice(0, 7);
  return {
    kind: 'spirit_seed',
    version: 1,
    fingerprint,
    hint: vigor >= 1.08 ? '灵机活跃' : vigor <= 0.88 ? '气息沉静' : '气息平和',
    ...(source ? { source } : {}),
    [HIDDEN_SPIRIT_SEED_KEY]: {
      version: 1,
      preferredTags: shuffled.slice(0, 2),
      avoidedTags: shuffled.slice(2, 3),
      vigor,
      outputBias: {
        herb: raw.herb / total,
        spiritFruit: raw.spiritFruit / total,
        treasure: raw.treasure / total,
      },
    },
  };
}

export function readSpiritSeedDetails(
  value: unknown,
): SpiritSeedPublicDetails | null {
  if (!value || typeof value !== 'object') return null;
  const details = value as Record<string, unknown>;
  if (
    details.kind !== 'spirit_seed' ||
    details.version !== 1 ||
    typeof details.fingerprint !== 'string'
  )
    return null;
  return details as unknown as SpiritSeedPublicDetails;
}

export function findCultivationMethod(
  id: string,
): CultivationMethodDefinition | undefined {
  return CULTIVATION_METHODS.find((method) => method.id === id);
}

export function nextHerbGardenStage(stage: HerbGardenStage): HerbGardenStage {
  if (stage === 'germination') return 'growth';
  if (stage === 'growth') return 'formation';
  return 'ready';
}

export interface StageResolution {
  fit: -1 | 0 | 1;
  scoreDelta: number;
  durationMultiplier: number;
  feedback: string;
}

export function resolveCultivationMethod(
  hidden: SpiritSeedHiddenSpec,
  methodId: CultivationMethodId,
): StageResolution {
  const method = findCultivationMethod(methodId);
  if (!method) throw new Error('未知培育法');
  const fit: -1 | 0 | 1 = hidden.preferredTags.includes(method.tag)
    ? 1
    : hidden.avoidedTags.includes(method.tag)
      ? -1
      : 0;
  return {
    fit,
    scoreDelta: Math.round((fit * 16 + 8) * hidden.vigor),
    durationMultiplier:
      methodId === 'qi_acceleration' ? 0.7 : fit < 0 ? 1.12 : fit > 0 ? 0.9 : 1,
    feedback:
      fit > 0
        ? '草木灵机与此法相合，叶脉间隐有清光。'
        : fit < 0
          ? '根须短暂蜷缩，灵机虽未断绝，却显得有些滞涩。'
          : '灵植平稳承受了本轮培育，气息未见明显偏转。',
  };
}

export type HerbGardenOutcomeKind = 'herb' | 'spirit_fruit' | 'treasure';

export function resolveOutcomeKind(
  hidden: SpiritSeedHiddenSpec,
  score: number,
  roll: number,
): HerbGardenOutcomeKind {
  const scoreBonus = Math.max(-0.08, Math.min(0.16, (score - 24) / 300));
  const treasure = Math.max(
    0.005,
    hidden.outputBias.treasure + scoreBonus * 0.35,
  );
  const fruit = Math.max(0.03, hidden.outputBias.spiritFruit + scoreBonus);
  if (roll < treasure) return 'treasure';
  if (roll < treasure + fruit) return 'spirit_fruit';
  return 'herb';
}

export interface HerbGardenSeedStack {
  materialId: string;
  name: string;
  rank: Quality;
  element?: ElementType;
  hint: string;
  fingerprint: string;
  quantity: number;
}

export type HerbGardenPlotStatus =
  'empty' | 'cultivating' | 'awaiting_action' | 'ready';

export interface HerbGardenStageRecord {
  stage: Exclude<HerbGardenStage, 'ready'>;
  methodId: CultivationMethodId;
  methodName: string;
  feedback: string;
  resolvedAt: string;
}

export interface HerbGardenPlotView {
  slot: number;
  plotId?: string;
  status: HerbGardenPlotStatus;
  stage?: HerbGardenStage;
  seedName?: string;
  seedRank?: Quality;
  element?: ElementType;
  hint?: string;
  plantedAt?: string;
  readyAt?: string;
  history?: HerbGardenStageRecord[];
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
  methods: CultivationMethodDefinition[];
  plots: HerbGardenPlotView[];
  seeds: HerbGardenSeedStack[];
  methodMaterials: Array<{
    materialId: string;
    name: string;
    type: Exclude<MaterialType, 'seed'>;
    rank: Quality;
    quantity: number;
  }>;
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
  kind: HerbGardenOutcomeKind;
  rank: Quality;
  quantity: number;
  returnedSeed?: { name: string; quantity: 1 };
}
