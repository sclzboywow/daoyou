import type { ElementType, Quality } from '@shared/types/constants';
import { SPIRIT_FIELD_PLANT_MAP } from './config';

export type SpiritFieldSeedMaterialSpec = {
  name: string;
  type: 'aux';
  rank: Quality;
  element: ElementType;
  description: string;
  details: {
    spiritFieldSeed: {
      version: 1;
      plantId: string;
    };
  };
};

export function buildSpiritFieldSeedDetails(plantId: string) {
  return {
    spiritFieldSeed: {
      version: 1 as const,
      plantId,
    },
  };
}

export function isSpiritFieldSeedMaterial(material: {
  details?: { spiritFieldSeed?: unknown } | null;
}): boolean {
  const seed = material.details?.spiritFieldSeed;
  if (!seed || typeof seed !== 'object') return false;
  const plantId = (seed as { plantId?: unknown }).plantId;
  return typeof plantId === 'string' && SPIRIT_FIELD_PLANT_MAP.has(plantId);
}

export function buildSpiritFieldSeedMaterial(
  plantId: string,
): SpiritFieldSeedMaterialSpec | null {
  const plant = SPIRIT_FIELD_PLANT_MAP.get(plantId);
  if (!plant) return null;
  return {
    name: plant.seedName,
    type: 'aux',
    rank: plant.quality,
    element: plant.element,
    description: `${plant.name}的灵种，可在个人灵田中播种。`,
    details: buildSpiritFieldSeedDetails(plant.id),
  };
}
