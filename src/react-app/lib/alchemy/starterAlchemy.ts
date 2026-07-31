import type { Material } from '@shared/types/cultivator';

export const STARTER_ALCHEMY_PROMPT = '疗伤回元，药性温和';
export const STARTER_ALCHEMY_MATERIAL_NAMES = ['青露草', '凝水花'] as const;

export interface StarterAlchemySelection {
  selectedIds: string[];
  selectedMap: Record<string, Material>;
  doseMap: Record<string, number>;
  missingNames: string[];
}

export function selectRecommendedStarterAlchemyMaterials(
  materials: Material[],
  minDose: number,
): StarterAlchemySelection {
  const selectedIds: string[] = [];
  const selectedMap: Record<string, Material> = {};
  const doseMap: Record<string, number> = {};
  const missingNames: string[] = [];

  for (const name of STARTER_ALCHEMY_MATERIAL_NAMES) {
    const material = materials.find(
      (candidate) =>
        candidate.name === name &&
        Boolean(candidate.id) &&
        candidate.quantity >= minDose,
    );

    if (!material?.id) {
      missingNames.push(name);
      continue;
    }

    selectedIds.push(material.id);
    selectedMap[material.id] = material;
    doseMap[material.id] = minDose;
  }

  return {
    selectedIds,
    selectedMap,
    doseMap,
    missingNames,
  };
}
