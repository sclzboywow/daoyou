import { describe, expect, it } from 'vitest';
import {
  RewardedAdClaimSchema,
  YieldAdClaimSchema,
} from '../contracts/rewardedAds';
import {
  isRewardedDefeat,
  rewardedRecovery,
  rewardedYieldSnapshot,
} from './rewardedAds';
describe('rewarded video rules', () => {
  it('doubles the original resource and item snapshot without rerolling or sharing the extra item data', () => {
    const resources = [
        { type: 'spirit_stones', value: 100 },
        { type: 'cultivation_exp', value: 30 },
        { type: 'comprehension_insight', value: 2 },
      ],
      items = [{ quantity: 1, spec: { name: '原始材料' } }];
    const ordinary = rewardedYieldSnapshot(resources, items, 1),
      bonus = rewardedYieldSnapshot(resources, items, 2);
    expect(ordinary.operations.map((r) => r.value)).toEqual([100, 30, 2]);
    expect(bonus.operations.map((r) => r.value)).toEqual([200, 60, 4]);
    expect(bonus.items).toHaveLength(2);
    bonus.items[1].spec.name = '另一个实例';
    expect(items[0].spec.name).toBe('原始材料');
    expect(resources[0].value).toBe(100);
    expect(() => rewardedYieldSnapshot([{ value: Infinity }], [], 2)).toThrow();
  });
  it('fills both resources to half, preserves higher resources and rejects invalid maxima', () => {
    expect(
      rewardedRecovery({ hp: 0, mp: 1 }, { maxHp: 100, maxMp: 51 }),
    ).toEqual({ hp: 50, mp: 26 });
    expect(
      rewardedRecovery({ hp: 80, mp: 50 }, { maxHp: 100, maxMp: 100 }),
    ).toEqual({ hp: 80, mp: 50 });
    expect(() =>
      rewardedRecovery({ hp: 0, mp: 0 }, { maxHp: Infinity, maxMp: 100 }),
    ).toThrow();
  });
  it('admits only the losing participant of persistent-resource combat', () => {
    expect(isRewardedDefeat('defeat', 0, 'wild-encounter')).toBe(true);
    expect(isRewardedDefeat('victory', 1, 'ranking')).toBe(true);
    expect(isRewardedDefeat('defeat', 1, 'ranking')).toBe(false);
    for (const source of ['training-room', 'arena-sparring'])
      expect(isRewardedDefeat('defeat', 0, source)).toBe(false);
    expect(isRewardedDefeat('draw', 0, 'tower')).toBe(false);
  });
  it('requires completion acknowledgement and rejects client-supplied reward amounts', () => {
    const ticketId = '00000000-0000-4000-8000-000000000001';
    expect(
      RewardedAdClaimSchema.safeParse({ ticketId, adCompleted: true }).success,
    ).toBe(true);
    expect(
      RewardedAdClaimSchema.safeParse({ ticketId, adCompleted: false }).success,
    ).toBe(false);
    expect(YieldAdClaimSchema.safeParse({}).success).toBe(true);
    expect(
      YieldAdClaimSchema.safeParse({ adTicketId: ticketId, adCompleted: true })
        .success,
    ).toBe(true);
    expect(YieldAdClaimSchema.safeParse({ multiplier: 2 }).success).toBe(false);
  });
});
