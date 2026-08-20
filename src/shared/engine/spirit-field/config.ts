import type { Quality, RealmType } from '@shared/types/constants';
import type { SpiritFieldPlantDefinition } from './types';

export const SPIRIT_FIELD_LEVELS = [
  { name: '凡田', upgradeCost: 0, speedBonus: 0 },
  { name: '灵田初级', upgradeCost: 10_000, speedBonus: 0.1 },
  { name: '灵田中级', upgradeCost: 50_000, speedBonus: 0.3 },
  { name: '灵田高级', upgradeCost: 300_000, speedBonus: 0.6 },
  { name: '药园初级', upgradeCost: 1_000_000, speedBonus: 1 },
  { name: '药园中级', upgradeCost: 3_000_000, speedBonus: 1.5 },
  { name: '药园高级', upgradeCost: 5_000_000, speedBonus: 2 },
] as const;

export const SPIRIT_FIELD_PLOT_UNLOCKS: ReadonlyArray<{
  index: number;
  minRealm: RealmType;
  minHarvest: number;
}> = [
  { index: 0, minRealm: '炼气', minHarvest: 0 },
  { index: 1, minRealm: '筑基', minHarvest: 50 },
  { index: 2, minRealm: '金丹', minHarvest: 100 },
  { index: 3, minRealm: '元婴', minHarvest: 300 },
  { index: 4, minRealm: '化神', minHarvest: 500 },
  { index: 5, minRealm: '炼虚', minHarvest: 1000 },
];

const qualityTiming: Record<Quality, { careSlots: number; cooldownMinutes: number }> = {
  凡品: { careSlots: 1, cooldownMinutes: 3 },
  灵品: { careSlots: 2, cooldownMinutes: 5 },
  玄品: { careSlots: 3, cooldownMinutes: 10 },
  真品: { careSlots: 4, cooldownMinutes: 15 },
  地品: { careSlots: 5, cooldownMinutes: 20 },
  天品: { careSlots: 6, cooldownMinutes: 30 },
  仙品: { careSlots: 7, cooldownMinutes: 45 },
  神品: { careSlots: 8, cooldownMinutes: 60 },
};

function plant(input: Omit<SpiritFieldPlantDefinition, 'careSlots' | 'careCooldownMs'>): SpiritFieldPlantDefinition {
  const timing = qualityTiming[input.quality];
  return {
    ...input,
    careSlots: timing.careSlots,
    careCooldownMs: timing.cooldownMinutes * 60_000,
  };
}

export const SPIRIT_FIELD_PLANTS: readonly SpiritFieldPlantDefinition[] = [
  plant({
    id: 'cui-ya-cao',
    name: '翠芽草',
    seedName: '翠芽草种子',
    quality: '凡品',
    element: '木',
    minRealm: '炼气',
    baseGrowthMs: 12 * 60_000,
    description: '溪畔常见灵草，药性温和，适合作为灵田入门。',
  }),
  plant({
    id: 'zi-xu-shen',
    name: '紫须参',
    seedName: '紫须参种子',
    quality: '灵品',
    element: '土',
    minRealm: '筑基',
    baseGrowthMs: 30 * 60_000,
    description: '根须呈淡紫色的灵参，喜土气稳定而忌积水。',
  }),
  plant({
    id: 'qi-xing-jue',
    name: '七星蕨',
    seedName: '七星蕨种子',
    quality: '玄品',
    element: '木',
    minRealm: '金丹',
    baseGrowthMs: 90 * 60_000,
    description: '月下叶脉如七星点亮，需耐心疏导木行灵机。',
  }),
  plant({
    id: 'jiu-ye-xuan-shen',
    name: '九叶玄参',
    seedName: '九叶玄参种子',
    quality: '真品',
    element: '土',
    minRealm: '元婴',
    baseGrowthMs: 3 * 60 * 60_000,
    description: '九叶齐生方算药成，根系极重土脉稳定。',
  }),
  plant({
    id: 'di-mai-long-zhi',
    name: '地脉龙芝',
    seedName: '地脉龙芝种子',
    quality: '地品',
    element: '土',
    minRealm: '化神',
    baseGrowthMs: 6 * 60 * 60_000,
    description: '依地脉而生，芝纹如龙鳞，灵气过乱反伤药性。',
  }),
  plant({
    id: 'tian-xin-lian',
    name: '天心莲',
    seedName: '天心莲种子',
    quality: '天品',
    element: '水',
    minRealm: '炼虚',
    baseGrowthMs: 12 * 60 * 60_000,
    description: '莲心聚清灵水意，需细察润养，不宜粗暴灌溉。',
  }),
  plant({
    id: 'xian-xia-yu-zhi',
    name: '仙霞玉芝',
    seedName: '仙霞玉芝种子',
    quality: '仙品',
    element: '木',
    minRealm: '合体',
    baseGrowthMs: 24 * 60 * 60_000,
    description: '晨霞照临时会映出玉色灵纹，养护越精细越显灵韵。',
  }),
  plant({
    id: 'hun-dun-qing-lian',
    name: '混沌青莲',
    seedName: '混沌青莲种子',
    quality: '神品',
    element: '水',
    minRealm: '大乘',
    baseGrowthMs: 48 * 60 * 60_000,
    description: '传说可纳混沌清气的神药，只宜顶尖灵田尝试培育。',
  }),
] as const;

export const SPIRIT_FIELD_PLANT_MAP = new Map(
  SPIRIT_FIELD_PLANTS.map((entry) => [entry.id, entry] as const),
);

export const SPIRIT_FIELD_STARTER_SEEDS = [
  { plantId: 'cui-ya-cao', quantity: 5 },
  { plantId: 'zi-xu-shen', quantity: 2 },
] as const;
