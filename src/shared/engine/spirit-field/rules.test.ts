import { describe, expect, it } from 'vitest';
import type { SpiritFieldPlantSnapshot } from './types';
import {
  calculateSpiritFieldGrowth,
  calculateSpiritFieldHarvestQuantity,
  createDefaultSpiritFieldPlots,
  evaluateCareAction,
  getSpiritFieldCareScore,
  getSpiritFieldQualityUpgradeChance,
  isSpiritFieldPlotUnlocked,
} from '.';

const plant: SpiritFieldPlantSnapshot = {
  id: 'test-plant',
  name: '试验灵草',
  seedName: '试验灵草灵种',
  quality: '玄品',
  element: '木',
  minRealm: '金丹',
  baseGrowthMs: 90 * 60_000,
  careSlots: 3,
  careCooldownMs: 10 * 60_000,
  description: '测试用灵植。',
  baseYieldMin: 3,
  baseYieldMax: 5,
};

describe('spirit field rules', () => {
  it('unlocks plots from realm and self harvest count', () => {
    expect(isSpiritFieldPlotUnlocked({ plotIndex: 0, realm: '炼气', selfHarvestCount: 0 })).toBe(true);
    expect(isSpiritFieldPlotUnlocked({ plotIndex: 1, realm: '筑基', selfHarvestCount: 49 })).toBe(false);
    expect(isSpiritFieldPlotUnlocked({ plotIndex: 1, realm: '筑基', selfHarvestCount: 50 })).toBe(true);
  });

  it('field speed bonus accelerates natural growth with a persisted plant snapshot', () => {
    const plots = createDefaultSpiritFieldPlots();
    plots[0] = {
      ...plots[0]!,
      plantId: plant.id,
      plant,
      plantedAt: new Date(0).toISOString(),
    };
    const slow = calculateSpiritFieldGrowth({ plot: plots[0]!, fieldLevel: 0, nowMs: 45 * 60_000 });
    const fast = calculateSpiritFieldGrowth({ plot: plots[0]!, fieldLevel: 4, nowMs: 45 * 60_000 });
    expect(fast.progress).toBeGreaterThan(slow.progress);
  });

  it('care grade contributes both growth acceleration and harvest score', () => {
    expect(evaluateCareAction('moisture_high', 'dry_soil')).toEqual({
      grade: 'excellent',
      boostPercent: 0.06,
      careScore: 100,
    });
    expect(evaluateCareAction('weak_growth', 'fertilize').grade).toBe('excellent');
    expect(evaluateCareAction('moisture_high', 'moisten').careScore).toBe(35);
  });

  it('good care produces more yield and a higher quality-upgrade chance', () => {
    const low = createDefaultSpiritFieldPlots()[0]!;
    low.plantId = plant.id;
    low.plant = plant;
    low.plantedAt = new Date(0).toISOString();
    low.careScoreTotal = 35;
    low.careScoreCount = 1;

    const high = { ...low, careScoreTotal: 100, careScoreCount: 1 };
    expect(getSpiritFieldCareScore(high)).toBe(100);
    expect(
      calculateSpiritFieldHarvestQuantity({
        plot: high,
        fieldLevel: 3,
        mode: 'broad',
        seed: 'same',
      }),
    ).toBeGreaterThan(
      calculateSpiritFieldHarvestQuantity({
        plot: low,
        fieldLevel: 3,
        mode: 'focused',
        seed: 'same',
      }),
    );
    expect(
      getSpiritFieldQualityUpgradeChance({ careScore: 100, fieldLevel: 3, mode: 'focused' }),
    ).toBeGreaterThan(
      getSpiritFieldQualityUpgradeChance({ careScore: 35, fieldLevel: 3, mode: 'focused' }),
    );
  });
});
