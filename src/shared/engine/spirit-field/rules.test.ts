import { describe, expect, it } from 'vitest';
import {
  calculateSpiritFieldGrowth,
  createDefaultSpiritFieldProfile,
  evaluateCareAction,
  isSpiritFieldPlotUnlocked,
} from '.';

describe('spirit field rules', () => {
  it('unlocks plots from realm and self harvest count', () => {
    expect(isSpiritFieldPlotUnlocked({ plotIndex: 0, realm: '炼气', selfHarvestCount: 0 })).toBe(true);
    expect(isSpiritFieldPlotUnlocked({ plotIndex: 1, realm: '筑基', selfHarvestCount: 49 })).toBe(false);
    expect(isSpiritFieldPlotUnlocked({ plotIndex: 1, realm: '筑基', selfHarvestCount: 50 })).toBe(true);
  });

  it('field speed bonus accelerates natural growth', () => {
    const profile = createDefaultSpiritFieldProfile();
    profile.plots[0] = {
      ...profile.plots[0]!,
      plantId: 'cui-ya-cao',
      plantedAt: new Date(0).toISOString(),
    };
    const slow = calculateSpiritFieldGrowth({ plot: profile.plots[0]!, fieldLevel: 0, nowMs: 6 * 60_000 });
    const fast = calculateSpiritFieldGrowth({ plot: profile.plots[0]!, fieldLevel: 4, nowMs: 6 * 60_000 });
    expect(fast.progress).toBeGreaterThan(slow.progress);
  });

  it('rewards a care action that matches the current need', () => {
    expect(evaluateCareAction('moisture_high', 'dry_soil')).toEqual({ grade: 'excellent', boostPercent: 0.06 });
    expect(evaluateCareAction('moisture_high', 'moisten').grade).toBe('poor');
  });
});
