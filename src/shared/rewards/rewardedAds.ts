/** Persistent battle recovery fills to half capacity; it never lowers a resource. */
export function rewardedRecovery(
  current: { hp: number; mp: number },
  maximum: { maxHp: number; maxMp: number },
) {
  for (const value of Object.values({ ...current, ...maximum }))
    if (!Number.isFinite(value) || value < 0) throw new Error('恢复资源无效');
  return {
    hp: Math.min(
      maximum.maxHp,
      Math.max(current.hp, Math.ceil(maximum.maxHp / 2)),
    ),
    mp: Math.min(
      maximum.maxMp,
      Math.max(current.mp, Math.ceil(maximum.maxMp / 2)),
    ),
  };
}
export function isRewardedDefeat(
  outcome: string,
  side: number,
  source: string,
) {
  return (
    [
      'wild-encounter',
      'tower',
      'dungeon',
      'sect-task',
      'breakthrough',
      'ranking',
    ].includes(source) &&
    ((outcome === 'defeat' && side === 0) ||
      (outcome === 'victory' && side === 1))
  );
}
export function rewardedYieldSnapshot<T extends { value: number }, I>(
  operations: T[],
  items: I[],
  multiplier: 1 | 2,
) {
  if (multiplier !== 1 && multiplier !== 2) throw new Error('历练倍率无效');
  const rewards = operations.map((operation) => {
    if (
      !Number.isFinite(operation.value) ||
      operation.value < 0 ||
      operation.value * multiplier > Number.MAX_SAFE_INTEGER
    )
      throw new Error('历练奖励数值无效');
    return { ...operation, value: operation.value * multiplier };
  });
  return {
    operations: rewards,
    items: multiplier === 2 ? [...items, ...structuredClone(items)] : items,
  };
}
