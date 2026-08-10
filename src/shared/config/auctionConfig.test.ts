import {
  calculateAuctionSettlement,
  getAuctionUnitPriceCap,
} from './auctionConfig';

describe('auctionConfig', () => {
  it('按单价超额累进计税并乘以成交数量', () => {
    expect(calculateAuctionSettlement(100_000, 3)).toEqual({
      unitPrice: 100_000,
      quantity: 3,
      grossAmount: 300_000,
      feeAmount: 14_400,
      sellerAmount: 285_600,
      marginalRatePercent: 5,
    });
  });

  it('跨税档后卖家到手金额仍然递增', () => {
    const before = calculateAuctionSettlement(100_000, 1);
    const after = calculateAuctionSettlement(100_001, 1);
    expect(after.sellerAmount).toBeGreaterThan(before.sellerAmount);
  });

  it('品质上限作用于单价而不是整单总价', () => {
    const unitPrice = getAuctionUnitPriceCap('天品');
    const quote = calculateAuctionSettlement(unitPrice, 40);
    expect(unitPrice).toBe(800_000);
    expect(quote.grossAmount).toBe(32_000_000);
  });
});
