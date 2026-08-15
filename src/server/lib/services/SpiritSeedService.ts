import {
  createSpiritSeedDetails,
  readSpiritSeedDetails,
  withSpiritSeedSource,
} from '@shared/contracts/herbGarden';
import type { GeneratedMaterial } from '@shared/engine/material/creation/types';
import { SpiritSeedGenerator } from '@shared/engine/material/creation/SpiritSeedGenerator';
import type {
  ElementType,
  MaterialType,
  Quality,
} from '@shared/types/constants';

const SEED_NAMES = [
  '青霄灵籽',
  '月汐道种',
  '赤霞玄籽',
  '岩心灵核',
  '风露异种',
  '雷纹灵籽',
  '寒魄道种',
];

export function createSpiritSeedMaterial(input: {
  rank: Quality;
  element?: ElementType;
  source?:
    | 'dungeon'
    | 'daily_yield'
    | 'market'
    | 'sect_treasury'
    | 'harvest'
    | 'starter';
  name?: string;
  quantity?: number;
  entropy?: string;
}): GeneratedMaterial {
  const entropy =
    input.entropy ??
    `${Date.now()}:${Math.random()}:${input.rank}:${input.element ?? ''}`;
  const name =
    input.name ??
    SEED_NAMES[Math.floor(Math.random() * SEED_NAMES.length)] ??
    '无名灵种';
  const element = input.element ?? '木';
  return {
    name,
    type: 'seed',
    rank: input.rank,
    element,
    description: `一枚来历未明的${input.rank}灵种，外显${element}行气息。真实种性须在三阶段培育中逐步验证。`,
    details: createSpiritSeedDetails(entropy, input.source),
    quantity: input.quantity ?? 1,
    price: Math.max(
      80,
      100 *
        ([
          '凡品',
          '灵品',
          '玄品',
          '真品',
          '地品',
          '天品',
          '仙品',
          '神品',
        ].indexOf(input.rank) +
          1),
    ),
  };
}

export function normalizeGeneratedSeed(
  material: GeneratedMaterial,
  source?: Parameters<typeof createSpiritSeedMaterial>[0]['source'],
): GeneratedMaterial {
  if (material.type !== 'seed') return material;
  const details = readSpiritSeedDetails(material.details);
  if (details) {
    return {
      ...material,
      details: withSpiritSeedSource(details, source),
      quantity: 1,
    };
  }
  return createSpiritSeedMaterial({
    rank: material.rank,
    element: material.element,
    source,
    name: material.name,
    quantity: 1,
  });
}

export async function enrichSpiritSeedMaterial<
  T extends {
    type: MaterialType;
    rank: Quality;
    element?: ElementType;
    name?: string;
    description?: string;
    details?: unknown;
    quantity?: number;
  },
>(material: T, source: Parameters<typeof createSpiritSeedMaterial>[0]['source']): Promise<T> {
  if (material.type !== 'seed') return material;
  const [copy] = await SpiritSeedGenerator.generateFromSkeletons(
    [
      {
        type: 'seed',
        rank: material.rank,
        quantity: 1,
        forcedElement: material.element,
      },
    ],
    source,
  );
  return {
    ...material,
    name: copy.name,
    description: copy.description,
    element: copy.element,
    details: copy.details,
    quantity: 1,
  };
}
