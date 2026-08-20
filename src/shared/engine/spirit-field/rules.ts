import { QUALITY_ORDER, REALM_ORDER, type RealmType } from '@shared/types/constants';
import {
  SPIRIT_FIELD_LEVELS,
  SPIRIT_FIELD_PLANT_MAP,
  SPIRIT_FIELD_PLANTS,
  SPIRIT_FIELD_PLOT_UNLOCKS,
} from './config';
import type {
  SpiritFieldCareAction,
  SpiritFieldCareNeed,
  SpiritFieldObservation,
  SpiritFieldPlotState,
  SpiritFieldProfileV1,
} from './types';

export function createDefaultSpiritFieldProfile(): SpiritFieldProfileV1 {
  return {
    version: 1,
    level: 0,
    selfHarvestCount: 0,
    totalCareCount: 0,
    starterClaimed: false,
    plots: Array.from({ length: 6 }, (_, index) => ({
      index,
      plantId: null,
      plantedAt: null,
      careCount: 0,
      careBoostMs: 0,
      lastCareAt: null,
      careNeed: null,
    })),
  };
}

export function normalizeSpiritFieldProfile(input: unknown): SpiritFieldProfileV1 {
  const fallback = createDefaultSpiritFieldProfile();
  if (!input || typeof input !== 'object') return fallback;
  const source = input as Partial<SpiritFieldProfileV1>;
  const plots = Array.isArray(source.plots) ? source.plots : [];
  return {
    version: 1,
    level: Math.min(6, Math.max(0, Math.floor(Number(source.level ?? 0)))),
    selfHarvestCount: Math.max(0, Math.floor(Number(source.selfHarvestCount ?? 0))),
    totalCareCount: Math.max(0, Math.floor(Number(source.totalCareCount ?? 0))),
    starterClaimed: Boolean(source.starterClaimed),
    plots: fallback.plots.map((base, index) => {
      const raw = plots[index];
      if (!raw || typeof raw !== 'object') return base;
      const plot = raw as SpiritFieldPlotState;
      return {
        index,
        plantId:
          typeof plot.plantId === 'string' && SPIRIT_FIELD_PLANT_MAP.has(plot.plantId)
            ? plot.plantId
            : null,
        plantedAt: typeof plot.plantedAt === 'string' ? plot.plantedAt : null,
        careCount: Math.max(0, Math.floor(Number(plot.careCount ?? 0))),
        careBoostMs: Math.max(0, Math.floor(Number(plot.careBoostMs ?? 0))),
        lastCareAt: typeof plot.lastCareAt === 'string' ? plot.lastCareAt : null,
        careNeed: isCareNeed(plot.careNeed) ? plot.careNeed : null,
      };
    }),
  };
}

function isCareNeed(value: unknown): value is SpiritFieldCareNeed {
  return (
    value === 'moisture_high' ||
    value === 'moisture_low' ||
    value === 'qi_stagnant' ||
    value === 'weak_growth'
  );
}

export function getSpiritFieldLevelConfig(level: number) {
  return SPIRIT_FIELD_LEVELS[Math.min(6, Math.max(0, Math.floor(level)))]!;
}

export function isSpiritFieldPlotUnlocked(args: {
  plotIndex: number;
  realm: RealmType;
  selfHarvestCount: number;
}): boolean {
  const rule = SPIRIT_FIELD_PLOT_UNLOCKS[args.plotIndex];
  if (!rule) return false;
  return (
    REALM_ORDER[args.realm] >= REALM_ORDER[rule.minRealm] &&
    args.selfHarvestCount >= rule.minHarvest
  );
}

export function canPlantSpiritFieldSeed(realm: RealmType, plantId: string): boolean {
  const plant = SPIRIT_FIELD_PLANT_MAP.get(plantId);
  return Boolean(plant && REALM_ORDER[realm] >= REALM_ORDER[plant.minRealm]);
}

export function calculateSpiritFieldGrowth(args: {
  plot: SpiritFieldPlotState;
  fieldLevel: number;
  nowMs?: number;
}): { progress: number; mature: boolean; remainingMs: number } {
  const plant = args.plot.plantId ? SPIRIT_FIELD_PLANT_MAP.get(args.plot.plantId) : null;
  if (!plant || !args.plot.plantedAt) return { progress: 0, mature: false, remainingMs: 0 };
  const plantedAt = Date.parse(args.plot.plantedAt);
  const now = args.nowMs ?? Date.now();
  const elapsed = Math.max(0, now - plantedAt) + args.plot.careBoostMs;
  const speedMultiplier = 1 + getSpiritFieldLevelConfig(args.fieldLevel).speedBonus;
  const effective = elapsed * speedMultiplier;
  const progress = Math.min(1, effective / plant.baseGrowthMs);
  const remainingEffective = Math.max(0, plant.baseGrowthMs - effective);
  return {
    progress,
    mature: progress >= 1,
    remainingMs: remainingEffective / speedMultiplier,
  };
}

export function getNextCareAt(plot: SpiritFieldPlotState): number | null {
  const plant = plot.plantId ? SPIRIT_FIELD_PLANT_MAP.get(plot.plantId) : null;
  if (!plant || !plot.lastCareAt) return null;
  return Date.parse(plot.lastCareAt) + plant.careCooldownMs;
}

export function chooseCareNeed(seed: string): SpiritFieldCareNeed {
  const needs: SpiritFieldCareNeed[] = [
    'moisture_high',
    'moisture_low',
    'qi_stagnant',
    'weak_growth',
  ];
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return needs[(hash >>> 0) % needs.length]!;
}

export function buildSpiritFieldObservations(need: SpiritFieldCareNeed | null): SpiritFieldObservation[] {
  switch (need) {
    case 'moisture_high':
      return [
        { topic: 'leaf', label: '叶色', text: '嫩叶略垂，叶缘带着潮重之感。', suggestedAction: '先看看是否土壤过湿。' },
        { topic: 'soil', label: '土壤', text: '泥土湿意偏重，指尖一捻仍会结团。', suggestedAction: '尝试疏土或温和祛湿。' },
        { topic: 'aura', label: '灵气', text: '根旁灵气尚足，却被湿气压得流转稍慢。', suggestedAction: '不要继续大量灌溉。' },
      ];
    case 'moisture_low':
      return [
        { topic: 'leaf', label: '叶色', text: '叶尖微卷，灵光显得有些干涩。', suggestedAction: '可考虑少量润养。' },
        { topic: 'soil', label: '土壤', text: '表土已经发干，细裂纹沿根旁散开。', suggestedAction: '少量灵泉比猛灌更稳妥。' },
        { topic: 'aura', label: '灵气', text: '水意偏弱，其余灵机仍算平稳。', suggestedAction: '补水即可，不必强行催生。' },
      ];
    case 'qi_stagnant':
      return [
        { topic: 'leaf', label: '叶色', text: '叶片无明显病相，却迟迟不见舒展。', suggestedAction: '问题可能不在水分。' },
        { topic: 'soil', label: '土壤', text: '土层松紧适中，看不出明显积水或干裂。', suggestedAction: '可从灵气流转入手。' },
        { topic: 'aura', label: '灵气', text: '根部灵机像被细结绊住，周转不畅。', suggestedAction: '尝试温养或疏导灵机。' },
      ];
    case 'weak_growth':
    default:
      return [
        { topic: 'leaf', label: '叶色', text: '新芽生得慢，但暂未出现明显枯败。', suggestedAction: '适合温和养护。' },
        { topic: 'soil', label: '土壤', text: '土性平稳，没有特别突出的异常。', suggestedAction: '无需大动土层。' },
        { topic: 'aura', label: '灵气', text: '整株灵机偏弱，像是缺少持续温养。', suggestedAction: '可用相合灵力缓缓培护。' },
      ];
  }
}

export function evaluateCareAction(need: SpiritFieldCareNeed | null, action: SpiritFieldCareAction) {
  const best: Partial<Record<SpiritFieldCareNeed, SpiritFieldCareAction[]>> = {
    moisture_high: ['dry_soil', 'loosen_soil'],
    moisture_low: ['moisten'],
    qi_stagnant: ['wood_nurture', 'loosen_soil'],
    weak_growth: ['wood_nurture'],
  };
  if (action === 'observe' || action === 'wait') {
    return { grade: 'neutral' as const, boostPercent: 0 };
  }
  if (need && best[need]?.includes(action)) {
    return { grade: 'excellent' as const, boostPercent: 0.06 };
  }
  if (action === 'wood_nurture' || action === 'loosen_soil') {
    return { grade: 'good' as const, boostPercent: 0.04 };
  }
  return { grade: 'poor' as const, boostPercent: 0.01 };
}

export function getCareQiCost(action: SpiritFieldCareAction): number {
  switch (action) {
    case 'wood_nurture':
      return 6;
    case 'dry_soil':
    case 'moisten':
      return 5;
    case 'loosen_soil':
      return 3;
    default:
      return 0;
  }
}

export function getCompanionRollCount(fieldLevel: number): number {
  return Math.min(6, Math.max(0, Math.floor(fieldLevel)));
}

export function getFocusedMainYield(fieldLevel: number): number {
  return fieldLevel >= 4 ? 2 : 1;
}

export function pickCompanionPlants(mainPlantId: string, rolls: number, seed: string) {
  const main = SPIRIT_FIELD_PLANT_MAP.get(mainPlantId);
  if (!main || rolls <= 0) return [];
  const candidates = SPIRIT_FIELD_PLANTS.filter(
    (candidate) => QUALITY_ORDER[candidate.quality] < QUALITY_ORDER[main.quality],
  );
  if (candidates.length === 0) return [];
  const results = [];
  for (let index = 0; index < rolls; index += 1) {
    let hash = 2166136261;
    const value = `${seed}:${index}`;
    for (let charIndex = 0; charIndex < value.length; charIndex += 1) {
      hash ^= value.charCodeAt(charIndex);
      hash = Math.imul(hash, 16777619);
    }
    if ((hash >>> 0) % 100 < 28) continue;
    results.push(candidates[(hash >>> 0) % candidates.length]!);
  }
  return results;
}
