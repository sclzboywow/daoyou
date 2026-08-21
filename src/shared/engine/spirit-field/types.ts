import type { ElementType, Quality, RealmType } from '@shared/types/constants';

export const SPIRIT_FIELD_CARE_ACTIONS = [
  'dry_soil',
  'moisten',
  'wood_nurture',
  'loosen_soil',
  'fertilize',
  'observe',
  'wait',
] as const;
export type SpiritFieldCareAction = (typeof SPIRIT_FIELD_CARE_ACTIONS)[number];

export const SPIRIT_FIELD_CARE_NEEDS = [
  'moisture_high',
  'moisture_low',
  'qi_stagnant',
  'weak_growth',
] as const;
export type SpiritFieldCareNeed = (typeof SPIRIT_FIELD_CARE_NEEDS)[number];

export type SpiritFieldHarvestMode = 'focused' | 'broad';

/**
 * 种子生成时固化的作物快照。
 * 数值来自服务器品质平衡配置；名称/描述/元素沿用 MaterialGenerator 的生成结果。
 * 播种后把快照写入田块，避免后续平衡调整让在田作物“变种”。
 */
export interface SpiritFieldPlantSnapshot {
  id: string;
  name: string;
  seedName: string;
  quality: Quality;
  element: ElementType;
  minRealm: RealmType;
  baseGrowthMs: number;
  careSlots: number;
  careCooldownMs: number;
  description: string;
  baseYieldMin: number;
  baseYieldMax: number;
}

export interface SpiritFieldSeedSpecV2 {
  version: 2;
  plant: SpiritFieldPlantSnapshot;
}

export interface SpiritFieldPlotState {
  index: number;
  /** 保留给前端/日志做稳定引用；真实规则以 plant 快照为准。 */
  plantId: string | null;
  plant: SpiritFieldPlantSnapshot | null;
  plantedAt: string | null;
  careCount: number;
  careBoostMs: number;
  careScoreTotal: number;
  careScoreCount: number;
  lastCareAt: string | null;
  careNeed: SpiritFieldCareNeed | null;
}

export interface SpiritFieldCarePlan {
  action: SpiritFieldCareAction;
  element?: ElementType;
  intensity: 'light' | 'moderate';
  target: 'soil' | 'root' | 'leaf' | 'whole';
  summary: string;
  reason: string;
  risk: string;
  qiCost: number;
}

export interface SpiritFieldObservation {
  topic: 'leaf' | 'soil' | 'aura';
  label: string;
  text: string;
  suggestedAction: string;
}

export type SpiritFieldCareGrade = 'excellent' | 'good' | 'poor' | 'neutral';
