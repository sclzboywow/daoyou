import type { ElementType, Quality, RealmType } from '@shared/types/constants';

export const SPIRIT_FIELD_CARE_ACTIONS = [
  'dry_soil',
  'moisten',
  'wood_nurture',
  'loosen_soil',
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

export interface SpiritFieldPlantDefinition {
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
}

export interface SpiritFieldPlotState {
  index: number;
  plantId: string | null;
  plantedAt: string | null;
  careCount: number;
  careBoostMs: number;
  lastCareAt: string | null;
  careNeed: SpiritFieldCareNeed | null;
}

export interface SpiritFieldProfileV1 {
  version: 1;
  level: number;
  selfHarvestCount: number;
  totalCareCount: number;
  starterClaimed: boolean;
  plots: SpiritFieldPlotState[];
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
