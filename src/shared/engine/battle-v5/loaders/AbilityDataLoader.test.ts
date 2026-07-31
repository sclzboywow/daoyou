const { rowsState, selectMock } = vi.hoisted(() => {
  const state = {
    rows: [] as any[],
  };
  return {
    rowsState: state,
    selectMock: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(async () => state.rows),
      })),
    })),
  };
});

vi.mock('@server/lib/drizzle/db', () => ({
  db: {
    select: selectMock,
  },
}));

vi.mock('@server/lib/drizzle/schema', () => ({
  creationProducts: {
    cultivatorId: 'cultivator_id',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn(),
}));

vi.mock('../../creation-v2/persistence/ProductPersistenceMapper', () => ({
  deserializeAndRehydrate: vi.fn(() => ({ productType: 'skill' })),
}));

vi.mock('../../creation-v2/models/AbilityProjection', () => ({
  projectAbilityConfig: vi.fn(() => ({ slug: 'loaded-ability' })),
}));

vi.mock('../factories/AbilityFactory', () => ({
  AbilityFactory: {
    create: vi.fn((config: { slug: string }) => ({ slug: config.slug })),
  },
}));

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AbilityDataLoader } from './AbilityDataLoader';

describe('AbilityDataLoader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rowsState.rows = [];
  });

  it('loads only enabled creation products for v2 abilities', async () => {
    rowsState.rows = [
      {
        id: 'enabled-skill',
        productType: 'skill',
        productModel: {},
        element: '火',
        isEquipped: true,
      },
      {
        id: 'disabled-skill',
        productType: 'skill',
        productModel: {},
        element: '火',
        isEquipped: false,
      },
      {
        id: 'disabled-artifact',
        productType: 'artifact',
        productModel: {},
        element: '金',
        isEquipped: false,
      },
    ];

    const abilities = await AbilityDataLoader.loadForCultivatorV2(
      'cultivator-1',
    );

    expect(abilities).toEqual([{ slug: 'enabled-skill' }]);
  });
});
