import {
  ELEMENT_VALUES,
  QUALITY_VALUES,
  REALM_VALUES,
  type ElementType,
  type Quality,
  type RealmType,
} from '@shared/types/constants';
import type { Material } from '@shared/types/cultivator';
import type {
  SpiritFieldPlantSnapshot,
  SpiritFieldSeedSpecV2,
} from './types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function isQuality(value: unknown): value is Quality {
  return typeof value === 'string' && QUALITY_VALUES.includes(value as Quality);
}

function isElement(value: unknown): value is ElementType {
  return typeof value === 'string' && ELEMENT_VALUES.includes(value as ElementType);
}

function isRealm(value: unknown): value is RealmType {
  return typeof value === 'string' && REALM_VALUES.includes(value as RealmType);
}

export function readSpiritFieldSeedSpec(details: unknown): SpiritFieldSeedSpecV2 | null {
  if (!isRecord(details)) return null;
  const rawSeed = details.spiritFieldSeed;
  if (!isRecord(rawSeed) || rawSeed.version !== 2 || !isRecord(rawSeed.plant)) {
    return null;
  }
  const plant = rawSeed.plant;
  if (
    typeof plant.id !== 'string' ||
    typeof plant.name !== 'string' ||
    typeof plant.seedName !== 'string' ||
    !isQuality(plant.quality) ||
    !isElement(plant.element) ||
    !isRealm(plant.minRealm) ||
    typeof plant.baseGrowthMs !== 'number' ||
    typeof plant.careSlots !== 'number' ||
    typeof plant.careCooldownMs !== 'number' ||
    typeof plant.description !== 'string' ||
    typeof plant.baseYieldMin !== 'number' ||
    typeof plant.baseYieldMax !== 'number'
  ) {
    return null;
  }

  return {
    version: 2,
    plant: {
      id: plant.id,
      name: plant.name,
      seedName: plant.seedName,
      quality: plant.quality,
      element: plant.element,
      minRealm: plant.minRealm,
      baseGrowthMs: Math.max(60_000, Math.floor(plant.baseGrowthMs)),
      careSlots: Math.max(1, Math.floor(plant.careSlots)),
      careCooldownMs: Math.max(0, Math.floor(plant.careCooldownMs)),
      description: plant.description,
      baseYieldMin: Math.max(1, Math.floor(plant.baseYieldMin)),
      baseYieldMax: Math.max(
        Math.max(1, Math.floor(plant.baseYieldMin)),
        Math.floor(plant.baseYieldMax),
      ),
    },
  };
}

export function isSpiritFieldSeedMaterial(material: {
  details?: unknown;
}): boolean {
  return readSpiritFieldSeedSpec(material.details) !== null;
}

export function buildSpiritFieldSeedDetails(plant: SpiritFieldPlantSnapshot) {
  return {
    spiritFieldSeed: {
      version: 2 as const,
      plant,
    },
  };
}

export function buildSpiritFieldSeedMaterialFromPlant(
  plant: SpiritFieldPlantSnapshot,
  quantity = 1,
): Omit<Material, 'id'> {
  return {
    name: plant.seedName,
    type: 'aux',
    rank: plant.quality,
    element: plant.element,
    description: `${plant.name}的灵种。其生长与产出参数在生成时已经固化，可在个人灵田播种。`,
    details: buildSpiritFieldSeedDetails(plant),
    quantity: Math.max(1, Math.floor(quantity)),
  };
}
