import { QUALITY_ORDER, type Quality } from '@shared/types/constants';
import type { MarketLayer } from '@shared/types/market';
import { SPIRIT_FIELD_PLANTS } from './config';
import type { SpiritFieldPlantDefinition } from './types';

/** 每层固定留给灵种的货架位；黑市不挂（神秘层会丢掉 details）。 */
export const SPIRIT_FIELD_MARKET_SEED_SLOTS: Record<MarketLayer, number> = {
  common: 2,
  treasure: 2,
  heaven: 1,
  black: 0,
};

export function listSpiritFieldPlantsForRankRange(range: {
  min: Quality;
  max: Quality;
}): SpiritFieldPlantDefinition[] {
  const minOrder = QUALITY_ORDER[range.min];
  const maxOrder = QUALITY_ORDER[range.max];
  return SPIRIT_FIELD_PLANTS.filter((plant) => {
    const order = QUALITY_ORDER[plant.quality];
    return order >= minOrder && order <= maxOrder;
  });
}

/**
 * 为指定坊市层挑选灵种。优先覆盖层内不同品质，不足时允许重复植物。
 */
export function pickSpiritFieldMarketSeedPlants(args: {
  layer: MarketLayer;
  rankRange: { min: Quality; max: Quality };
  count?: number;
  random?: () => number;
}): SpiritFieldPlantDefinition[] {
  const slots =
    args.count ?? SPIRIT_FIELD_MARKET_SEED_SLOTS[args.layer] ?? 0;
  if (slots <= 0) return [];

  const candidates = listSpiritFieldPlantsForRankRange(args.rankRange);
  if (candidates.length === 0) return [];

  const random = args.random ?? Math.random;
  const shuffled = [...candidates].sort(() => random() - 0.5);
  const picked: SpiritFieldPlantDefinition[] = [];

  for (const plant of shuffled) {
    if (picked.length >= slots) break;
    picked.push(plant);
  }

  while (picked.length < slots) {
    picked.push(shuffled[Math.floor(random() * shuffled.length)]!);
  }

  return picked;
}
