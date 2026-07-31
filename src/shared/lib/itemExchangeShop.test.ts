import { describe, expect, it } from 'vitest';
import {
  getItemExchangePurchaseWeek,
  getItemExchangeQuantityError,
} from './itemExchangeShop';

describe('item exchange shop rules', () => {
  it('uses Monday as the Shanghai weekly boundary', () => {
    expect(
      getItemExchangePurchaseWeek(new Date('2026-07-26T15:59:59.999Z')),
    ).toBe('2026-07-20');
    expect(
      getItemExchangePurchaseWeek(new Date('2026-07-26T16:00:00.000Z')),
    ).toBe('2026-07-27');
  });

  it('enforces item-library grant quantities', () => {
    expect(
      getItemExchangeQuantityError({ itemType: 'artifact', quantity: 2 }),
    ).toBe('法宝类商品每次只能发放 1 件');
    expect(
      getItemExchangeQuantityError({ itemType: 'material', quantity: 31 }),
    ).toContain('最多发放 30 件');
    expect(
      getItemExchangeQuantityError({ itemType: 'consumable', quantity: 30 }),
    ).toBeNull();
  });
});
