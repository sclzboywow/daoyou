import { getRealmStageRank } from '@shared/config/realmProgression';
import type { RealmStage, RealmType } from '@shared/types/constants';
import type {
  SectMethodId,
  SectPathDefinition,
  SectPathLayerDefinition,
  SectTrainingCost,
} from '../domain';

export interface SectPathProgressProjection {
  unlockedLayers: SectPathLayerDefinition[];
  nextLayer: SectPathLayerDefinition | null;
  nextLayerAvailable: boolean;
  missingRequirements: string[];
}

export interface SectProgressionPolicy {
  methodLevelCap(realm: RealmType, stage: RealmStage): number;
  methodTrainingCost(fromLevel: number, targetLevel: number): SectTrainingCost;
  pathProgress(args: {
    path: SectPathDefinition;
    unlockedLayerIds: string[];
    realm: RealmType;
    stage: RealmStage;
    methods: Partial<Record<SectMethodId, number>>;
  }): SectPathProgressProjection;
  assertPathLayerUnlock(args: {
    path: SectPathDefinition;
    unlockedLayerIds: string[];
    layerId: string;
    realm: RealmType;
    stage: RealmStage;
    methods: Partial<Record<SectMethodId, number>>;
  }): SectPathLayerDefinition;
}

export const STANDARD_SECT_METHOD_COST_CURVE = {
  baseCultivationExp: 50,
  growthRate: 1.05,
  cultivationRoundUnit: 10,
  spiritStoneMultiplier: 3,
  spiritStoneRoundUnit: 100,
} as const;

export const STANDARD_SECT_PATH_COST_CURVE = {
  baseCultivationExp: 5_000,
  growthMultiplier: 4,
  spiritStoneMultiplier: 5,
  comprehensionInsight: 100,
} as const;

function roundUpToUnit(value: number, unit: number): number {
  return Math.ceil(value / unit) * unit;
}

function methodLevelTrainingCost(level: number): SectTrainingCost {
  const cultivationExp = roundUpToUnit(
    STANDARD_SECT_METHOD_COST_CURVE.baseCultivationExp *
      STANDARD_SECT_METHOD_COST_CURVE.growthRate ** (level - 1),
    STANDARD_SECT_METHOD_COST_CURVE.cultivationRoundUnit,
  );
  return {
    cultivationExp,
    comprehensionInsight: 0,
    spiritStones: roundUpToUnit(
      cultivationExp *
        STANDARD_SECT_METHOD_COST_CURVE.spiritStoneMultiplier,
      STANDARD_SECT_METHOD_COST_CURVE.spiritStoneRoundUnit,
    ),
  };
}

function pathLayerCost(order: number): SectTrainingCost {
  const cultivationExp =
    STANDARD_SECT_PATH_COST_CURVE.baseCultivationExp *
    STANDARD_SECT_PATH_COST_CURVE.growthMultiplier ** (order - 1);
  return {
    cultivationExp,
    comprehensionInsight:
      STANDARD_SECT_PATH_COST_CURVE.comprehensionInsight,
    spiritStones:
      cultivationExp * STANDARD_SECT_PATH_COST_CURVE.spiritStoneMultiplier,
  };
}

export const STANDARD_PATH_LAYERS: readonly SectPathLayerDefinition[] = [
  {
    id: '1',
    order: 1,
    label: '第一层',
    minRealm: '筑基',
    minRealmStage: '中期',
    cost: pathLayerCost(1),
  },
  {
    id: '2',
    order: 2,
    label: '第二层',
    minRealm: '金丹',
    minRealmStage: '圆满',
    cost: pathLayerCost(2),
  },
  {
    id: '3',
    order: 3,
    label: '第三层',
    minRealm: '化神',
    minRealmStage: '中期',
    cost: pathLayerCost(3),
  },
  {
    id: '4',
    order: 4,
    label: '第四层',
    minRealm: '炼虚',
    minRealmStage: '圆满',
    cost: pathLayerCost(4),
  },
  {
    id: '5',
    order: 5,
    label: '第五层',
    minRealm: '大乘',
    minRealmStage: '中期',
    cost: pathLayerCost(5),
  },
  {
    id: 'ultimate',
    order: 6,
    label: '终式',
    minRealm: '渡劫',
    minRealmStage: '圆满',
    cost: pathLayerCost(6),
  },
] as const;

function sortedLayers(path: SectPathDefinition): SectPathLayerDefinition[] {
  return [...path.layers].sort((left, right) => left.order - right.order);
}

function missingLayerRequirements(args: {
  layer: SectPathLayerDefinition;
  realm: RealmType;
  stage: RealmStage;
  methods: Partial<Record<SectMethodId, number>>;
}): string[] {
  const missing: string[] = [];
  if (
    args.layer.minRealm &&
    args.layer.minRealmStage &&
    getRealmStageRank(args.realm, args.stage) <
      getRealmStageRank(args.layer.minRealm, args.layer.minRealmStage)
  ) {
    missing.push(`${args.layer.minRealm}${args.layer.minRealmStage}`);
  }
  for (const [methodId, level] of Object.entries(
    args.layer.requiredMethods ?? {},
  )) {
    if ((args.methods[methodId] ?? 0) < level) {
      missing.push(`心法 ${methodId} ${level}级`);
    }
  }
  return missing;
}

/** 通用宗门成长策略；具体流派只声明层定义，不参与流程分派。 */
export class StandardSectProgressionPolicy implements SectProgressionPolicy {
  methodLevelCap(realm: RealmType, stage: RealmStage): number {
    return (getRealmStageRank(realm, stage) + 1) * 5;
  }

  methodTrainingCost(fromLevel: number, targetLevel: number): SectTrainingCost {
    const total: SectTrainingCost = {
      cultivationExp: 0,
      comprehensionInsight: 0,
      spiritStones: 0,
    };
    for (let level = fromLevel + 1; level <= targetLevel; level += 1) {
      const cost = methodLevelTrainingCost(level);
      total.cultivationExp += cost.cultivationExp;
      total.spiritStones += cost.spiritStones;
    }
    return total;
  }

  pathProgress(args: {
    path: SectPathDefinition;
    unlockedLayerIds: string[];
    realm: RealmType;
    stage: RealmStage;
    methods: Partial<Record<SectMethodId, number>>;
  }): SectPathProgressProjection {
    const unlocked = new Set(args.unlockedLayerIds);
    const layers = sortedLayers(args.path);
    const nextLayer = layers.find((layer) => !unlocked.has(layer.id)) ?? null;
    const missingRequirements = nextLayer
      ? missingLayerRequirements({ ...args, layer: nextLayer })
      : [];
    return {
      unlockedLayers: layers.filter((layer) => unlocked.has(layer.id)),
      nextLayer,
      nextLayerAvailable:
        Boolean(nextLayer) && missingRequirements.length === 0,
      missingRequirements,
    };
  }

  assertPathLayerUnlock(args: {
    path: SectPathDefinition;
    unlockedLayerIds: string[];
    layerId: string;
    realm: RealmType;
    stage: RealmStage;
    methods: Partial<Record<SectMethodId, number>>;
  }): SectPathLayerDefinition {
    const progress = this.pathProgress(args);
    const requested = args.path.layers.find(
      (layer) => layer.id === args.layerId,
    );
    if (!requested) throw new Error('未知流派层级');
    if (args.unlockedLayerIds.includes(args.layerId))
      throw new Error(`${requested.label}已经解锁`);
    if (progress.nextLayer?.id !== args.layerId)
      throw new Error('流派层级必须按顺序解锁');
    if (!progress.nextLayerAvailable)
      throw new Error(`尚需：${progress.missingRequirements.join('、')}`);
    return requested;
  }
}

export const standardSectProgression = new StandardSectProgressionPolicy();
