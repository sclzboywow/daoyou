export type YieldRewardMode = 'normal' | 'rewarded_double';
export type RewardedAdKind = 'battle-heal' | 'yield-double';

export const REWARDED_AD_UNITS: Record<RewardedAdKind, string> = {
  'battle-heal': 'adunit-8620460ebe1846cd',
  'yield-double': 'adunit-dd9c75755666cd7f',
};

export function yieldRewardMultiplier(
  mode: YieldRewardMode | undefined,
): 1 | 2 {
  return mode === 'rewarded_double' ? 2 : 1;
}

export function scaleYieldValue(value: number, multiplier: 1 | 2): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value * multiplier);
}

/** 激励疗伤：按资源上限的一半回补，且不超过上限。气血与法力共用。 */
export function applyRewardedBattleHeal(
  current: number,
  max: number,
): number {
  const safeCurrent = Number.isFinite(current)
    ? Math.max(0, Math.floor(current))
    : 0;
  const safeMax = Number.isFinite(max) ? Math.max(0, Math.floor(max)) : 0;
  if (safeMax <= 0) return safeCurrent;
  return Math.min(safeMax, safeCurrent + Math.floor(safeMax * 0.5));
}
