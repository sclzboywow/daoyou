import {
  projectAbilityConfig,
  type ArtifactProductModel,
  type GongFaProductModel,
  type SkillProductModel,
} from '@shared/engine/creation-v2/models';
import type {
  ElementType,
  RealmStage,
  RealmType,
} from '@shared/types/constants';
import type {
  Artifact,
  CultivationTechnique,
  Skill,
} from '@shared/types/cultivator';

export function buildTechniqueFromProductModel(
  productModel: GongFaProductModel,
  options: {
    element?: ElementType;
    id?: string;
    name?: string;
    description?: string;
  } = {},
): CultivationTechnique {
  const abilityConfig = projectAbilityConfig(productModel);
  if (options.name) {
    abilityConfig.name = options.name;
  }

  return {
    ...(options.id ? { id: options.id } : {}),
    name: options.name ?? productModel.name,
    element: options.element,
    quality: productModel.projectionQuality,
    description: options.description ?? productModel.description,
    attributeModifiers: abilityConfig.modifiers ?? [],
    abilityConfig,
    productModel,
  };
}

export function buildSkillFromProductModel(
  productModel: SkillProductModel,
  options: {
    element: ElementType;
    id?: string;
    name?: string;
    description?: string;
  },
): Skill {
  const abilityConfig = projectAbilityConfig(productModel);
  if (options.name) {
    abilityConfig.name = options.name;
  }

  return {
    ...(options.id ? { id: options.id } : {}),
    name: options.name ?? productModel.name,
    element: options.element,
    quality: productModel.projectionQuality,
    description: options.description ?? productModel.description,
    cost: abilityConfig.mpCost ?? 0,
    cooldown: abilityConfig.cooldown ?? 0,
    target_self:
      abilityConfig.targetPolicy?.team === 'self'
        ? true
        : abilityConfig.targetPolicy?.team === 'enemy'
          ? false
          : undefined,
    abilityConfig,
    productModel,
  };
}

export function buildArtifactFromProductModel(
  productModel: ArtifactProductModel,
  options: {
    element: ElementType;
    id?: string;
    score?: number;
    isEquipped?: boolean;
    realm?: RealmType;
    realmStage?: RealmStage;
    name?: string;
    description?: string;
  },
): Artifact {
  const abilityConfig = projectAbilityConfig(productModel);
  if (options.name) {
    abilityConfig.name = options.name;
  }

  return {
    ...(options.id ? { id: options.id } : {}),
    name: options.name ?? productModel.name,
    slot: productModel.artifactConfig.slot ?? 'weapon',
    element: options.element,
    quality: productModel.projectionQuality,
    description: options.description ?? productModel.description,
    attributeModifiers: abilityConfig.modifiers ?? [],
    abilityConfig,
    productModel,
    ...(options.score !== undefined ? { score: options.score } : {}),
    ...(options.isEquipped !== undefined ? { isEquipped: options.isEquipped } : {}),
    battleRuntimeMeta: {
      anchorRealm: options.realm,
      anchorRealmStage: options.realmStage,
    },
  };
}
