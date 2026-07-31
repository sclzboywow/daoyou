import type {
  AbilityConfig,
} from '@shared/engine/battle-v5/core/configs';
import {
  projectAbilityConfig,
  type GongFaProductModel,
  type SkillProductModel,
} from '@shared/engine/creation-v2/models';
import type { ElementType, Quality } from '@shared/types/constants';
import type { CultivationTechnique, Skill } from '@shared/types/cultivator';
import {
  buildPresetSkill,
  buildPresetTechnique,
  composePresetProductModel,
  type InitializedSkill,
  type InitializedTechnique,
} from './presetProducts';

const STARTER_QUALITY: Quality = '凡品';

interface StarterTechniqueRecipe {
  affixIds: string[];
}

interface StarterSkillRecipe {
  affixIds: string[];
}

const starterTechniqueRecipes = new Map<string, StarterTechniqueRecipe>([
  ['金:金锐功', { affixIds: ['gongfa-foundation-atk'] }],
  ['木:长春功', { affixIds: ['gongfa-foundation-vitality'] }],
  ['水:玄水诀', { affixIds: ['gongfa-foundation-spirit'] }],
  ['火:烈阳功', { affixIds: ['gongfa-foundation-magic-atk'] }],
  ['土:厚土经', { affixIds: ['gongfa-foundation-def'] }],
  ['风:御风诀', { affixIds: ['gongfa-foundation-speed'] }],
  ['雷:紫雷诀', { affixIds: ['gongfa-foundation-control-hit'] }],
  ['冰:凝霜诀', { affixIds: ['gongfa-foundation-magic-def'] }],
]);

const starterSkillRecipes = new Map<string, StarterSkillRecipe>([
  ['金:金锋术', { affixIds: ['skill-core-damage-metal'] }],
  ['金:铁皮术', { affixIds: ['skill-core-guard-aura'] }],
  ['木:缠绕术', { affixIds: ['skill-core-damage-wood'] }],
  ['木:回春术', { affixIds: ['skill-core-heal'] }],
  ['水:冰锥术', { affixIds: ['skill-core-damage-water'] }],
  ['水:水罩术', { affixIds: ['skill-core-guard-aura'] }],
  ['火:烈焰指', { affixIds: ['skill-core-damage-fire'] }],
  ['火:焰息诀', { affixIds: ['skill-core-fire-channeling'] }],
  ['土:落石术', { affixIds: ['skill-core-damage-earth'] }],
  ['土:厚土护体', { affixIds: ['skill-core-guard-aura'] }],
  ['风:风刃', { affixIds: ['skill-core-damage-wind'] }],
  ['风:清风诀', { affixIds: ['skill-core-wind-haste'] }],
  ['雷:紫雷击', { affixIds: ['skill-core-damage-thunder'] }],
  ['雷:雷护身', { affixIds: ['skill-core-guard-aura'] }],
  ['冰:寒冰刺', { affixIds: ['skill-core-damage-ice'] }],
  ['冰:冰幕诀', { affixIds: ['skill-core-ice-frost-guard'] }],
]);

function recipeKey(element: ElementType | undefined, name: string): string {
  return `${element ?? 'mixed'}:${name}`;
}

function hashText(input: string): string {
  let hash = 2166136261;
  for (const char of input) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36);
}

function hasPopulatedAffixes(
  productModel: unknown,
): productModel is { affixes: Array<unknown> } {
  return Boolean(
    productModel &&
      typeof productModel === 'object' &&
      Array.isArray((productModel as { affixes?: unknown[] }).affixes) &&
      (productModel as { affixes: unknown[] }).affixes.length > 0,
  );
}

function normalizeTechniqueFromRecipe(
  technique: CultivationTechnique,
  recipe: StarterTechniqueRecipe,
): InitializedTechnique {
  return {
    ...technique,
    ...buildPresetTechnique({
      name: technique.name,
      element: technique.element ?? '金',
      description: technique.description,
      affixIds: recipe.affixIds,
    }),
  };
}

function normalizeSkillFromRecipe(
  skill: Skill,
  recipe: StarterSkillRecipe,
): InitializedSkill {
  return {
    ...skill,
    ...buildPresetSkill({
      name: skill.name,
      element: skill.element,
      description: skill.description,
      affixIds: recipe.affixIds,
    }),
  };
}

export function ensureStarterTechnique(
  technique: CultivationTechnique,
): InitializedTechnique {
  const recipe = starterTechniqueRecipes.get(
    recipeKey(technique.element, technique.name),
  );

  if (recipe && !hasPopulatedAffixes(technique.productModel)) {
    return normalizeTechniqueFromRecipe(technique, recipe);
  }

  const productModel = technique.productModel as GongFaProductModel | undefined;
  const abilityConfig = technique.abilityConfig
    ? technique.abilityConfig
    : productModel
      ? projectAbilityConfig(productModel)
      : undefined;

  return {
    ...technique,
    quality:
      technique.quality ??
      productModel?.projectionQuality ??
      STARTER_QUALITY,
    attributeModifiers:
      technique.attributeModifiers ?? abilityConfig?.modifiers ?? [],
    abilityConfig: abilityConfig ?? {
      slug: `starter-gongfa-fallback-${hashText(technique.name)}`,
      name: technique.name,
      type: 'passive_skill' as AbilityConfig['type'],
      tags: ['Ability.Kind.GongFa'],
      listeners: [],
      modifiers: technique.attributeModifiers ?? [],
    },
    productModel:
      productModel ??
      composePresetProductModel({
        productType: 'gongfa',
        element: technique.element ?? '金',
        name: technique.name,
        description: technique.description,
        affixIds: ['gongfa-foundation-spirit'],
      }),
  } as InitializedTechnique;
}

export function ensureStarterSkill(skill: Skill): InitializedSkill {
  const recipe = starterSkillRecipes.get(recipeKey(skill.element, skill.name));

  if (recipe && !hasPopulatedAffixes(skill.productModel)) {
    return normalizeSkillFromRecipe(skill, recipe);
  }

  const productModel = skill.productModel as SkillProductModel | undefined;
  const abilityConfig = skill.abilityConfig
    ? skill.abilityConfig
    : productModel
      ? projectAbilityConfig(productModel)
      : undefined;

  return {
    ...skill,
    quality:
      skill.quality ??
      productModel?.projectionQuality ??
      STARTER_QUALITY,
    cost: abilityConfig?.mpCost ?? skill.cost ?? 0,
    cooldown: abilityConfig?.cooldown ?? skill.cooldown ?? 0,
    target_self:
      abilityConfig?.targetPolicy?.team === 'self'
        ? true
        : abilityConfig?.targetPolicy?.team === 'enemy'
          ? false
          : skill.target_self,
    abilityConfig:
      abilityConfig ??
      projectAbilityConfig(
        composePresetProductModel({
          productType: 'skill',
          element: skill.element,
          name: skill.name,
          description: skill.description,
          affixIds: ['skill-core-damage'],
        }) as SkillProductModel,
      ),
    productModel:
      productModel ??
      composePresetProductModel({
        productType: 'skill',
        element: skill.element,
        name: skill.name,
        description: skill.description,
        affixIds: ['skill-core-damage'],
      }),
  } as InitializedSkill;
}
