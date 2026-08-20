import {
  listSpiritFieldPlantsForRankRange,
  pickSpiritFieldMarketSeedPlants,
  SPIRIT_FIELD_MARKET_SEED_SLOTS,
} from './marketOfferings';
import { buildSpiritFieldSeedMaterial } from './seedMaterial';

describe('spirit-field market offerings', () => {
  it('maps plants into layer quality ranges', () => {
    const common = listSpiritFieldPlantsForRankRange({
      min: '凡品',
      max: '玄品',
    }).map((plant) => plant.id);
    expect(common).toEqual(
      expect.arrayContaining(['cui-ya-cao', 'zi-xu-shen', 'qi-xing-jue']),
    );
    expect(common).not.toContain('di-mai-long-zhi');
  });

  it('reserves seed slots for non-black layers only', () => {
    expect(SPIRIT_FIELD_MARKET_SEED_SLOTS.common).toBe(2);
    expect(SPIRIT_FIELD_MARKET_SEED_SLOTS.black).toBe(0);
  });

  it('picks deterministic seeds with injected rng', () => {
    let i = 0;
    const sequence = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
    const picked = pickSpiritFieldMarketSeedPlants({
      layer: 'common',
      rankRange: { min: '凡品', max: '玄品' },
      random: () => sequence[i++ % sequence.length]!,
    });
    expect(picked).toHaveLength(2);
    expect(
      picked.every((plant) => buildSpiritFieldSeedMaterial(plant.id)),
    ).toBe(true);
  });
});
