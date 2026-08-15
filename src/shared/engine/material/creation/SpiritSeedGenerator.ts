import { renderPrompt } from '@server/lib/prompts';
import { generateAiArray } from '@server/utils/aiClient';
import {
  SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES,
  SPIRIT_PLANTING_METHOD_TAG_VALUES,
  SPIRIT_PLANT_GROWTH_TRAIT_TAG_VALUES,
  SPIRIT_SEED_OUTCOME_BIAS_VALUES,
  createSpiritSeedDetails,
  type SpiritSeedDetails,
  type SpiritSeedSource,
  type SpiritSeedSpec,
} from '@shared/contracts/herbGarden';
import {
  CREATION_MATERIAL_SEMANTIC_TAGS,
  CreationTags,
} from '@shared/engine/shared/tag-domain';
import { stableCompactStringify } from '@server/utils/llmPayload';
import { ELEMENT_VALUES, type ElementType } from '@shared/types/constants';
import { z } from 'zod';
import type { MaterialSkeleton } from './types';

const spiritSeedSpecSchema = z
  .object({
    preferredMethodTags: z
      .array(z.enum(SPIRIT_PLANTING_METHOD_TAG_VALUES))
      .min(2)
      .max(3),
    avoidedMethodTags: z
      .array(z.enum(SPIRIT_PLANTING_METHOD_TAG_VALUES))
      .min(1)
      .max(2),
    preferredEnvironmentTags: z
      .array(z.enum(SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES))
      .min(1)
      .max(2),
    avoidedEnvironmentTags: z
      .array(z.enum(SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES))
      .max(2),
    growthTraitTags: z
      .array(z.enum(SPIRIT_PLANT_GROWTH_TRAIT_TAG_VALUES))
      .min(2)
      .max(4),
    outcomeBiases: z
      .array(z.enum(SPIRIT_SEED_OUTCOME_BIAS_VALUES))
      .min(1)
      .max(2),
    semanticTags: z
      .array(z.enum(CREATION_MATERIAL_SEMANTIC_TAGS))
      .min(1)
      .max(3),
  })
  .strict()
  .superRefine((spec, context) => {
    const methodOverlap = spec.preferredMethodTags.filter((tag) =>
      spec.avoidedMethodTags.includes(tag),
    );
    const environmentOverlap = spec.preferredEnvironmentTags.filter((tag) =>
      spec.avoidedEnvironmentTags.includes(tag),
    );
    if (methodOverlap.length)
      context.addIssue({
        code: 'custom',
        path: ['avoidedMethodTags'],
        message: '喜好与排斥培育方式不得重叠',
      });
    if (environmentOverlap.length)
      context.addIssue({
        code: 'custom',
        path: ['avoidedEnvironmentTags'],
        message: '喜好与排斥环境不得重叠',
      });
  });

const SpiritSeedAISchema = z
  .object({
    name: z.string().min(2).max(10),
    description: z.string().min(20).max(120),
    element: z.enum(ELEMENT_VALUES),
    details: z
      .object({
        kind: z.literal('spirit_seed'),
        version: z.literal(1),
        seedSpec: spiritSeedSpecSchema,
      })
      .strict(),
  })
  .strict();

export interface SpiritSeedGeneratedCopy {
  name: string;
  description: string;
  element: ElementType;
  details: SpiritSeedDetails;
}

const ELEMENT_SEED_NAMES: Record<ElementType, string> = {
  金: '庚露灵核',
  木: '青露灵籽',
  水: '寒潭月籽',
  火: '赤霞炎种',
  土: '岩心厚籽',
  风: '风絮灵种',
  雷: '雷纹玄核',
  冰: '霜眠晶籽',
};

function fallbackDescription(element: ElementType, spec: SpiritSeedSpec): string {
  const prefersShade = spec.preferredEnvironmentTags.includes('shaded_cool');
  const prefersMoisture = spec.preferredEnvironmentTags.includes('moist_watered');
  const avoidsQi = spec.avoidedMethodTags.includes('qi_acceleration');
  const opening = prefersShade
    ? '籽壳在阴凉处才会浮出细纹'
    : '籽壳迎着晨光会透出淡淡灵纹';
  const middle = prefersMoisture
    ? '，沾上清露后纹路渐渐舒展'
    : `，其中隐约流转着${element}行气息`;
  const ending = avoidsQi
    ? '；若骤然灌入过盛灵气，外壳反会自行收紧。'
    : '；气机平稳时，壳内会传出极轻的草木清香。';
  return `${opening}${middle}${ending}`;
}

function buildFallback(
  skeleton: MaterialSkeleton,
  index: number,
  source?: SpiritSeedSource,
): SpiritSeedGeneratedCopy {
  const element = skeleton.forcedElement ?? ELEMENT_VALUES[index % ELEMENT_VALUES.length] ?? '木';
  const name = ELEMENT_SEED_NAMES[element];
  const details = createSpiritSeedDetails(
    `seed-fallback:${source ?? 'unknown'}:${skeleton.rank}:${element}:${Date.now()}:${index}:${Math.random()}`,
    source,
  );
  return {
    name,
    element,
    description: fallbackDescription(element, details.seedSpec!),
    details,
  };
}

function lines(values: readonly string[]): string {
  return values.map((value) => `- ${value}`).join('\n');
}

export class SpiritSeedGenerator {
  static async generateFromSkeletons(
    skeletons: MaterialSkeleton[],
    source?: SpiritSeedSource,
  ): Promise<SpiritSeedGeneratedCopy[]> {
    if (!skeletons.length) return [];
    const { system, user } = renderPrompt('spirit-seed-generation', {
      methodTagTable: lines(SPIRIT_PLANTING_METHOD_TAG_VALUES),
      environmentTagTable: lines(SPIRIT_PLANTING_ENVIRONMENT_TAG_VALUES),
      growthTraitTagTable: lines(SPIRIT_PLANT_GROWTH_TRAIT_TAG_VALUES),
      outcomeBiasTable: lines(SPIRIT_SEED_OUTCOME_BIAS_VALUES),
      semanticTagTable: lines(CREATION_MATERIAL_SEMANTIC_TAGS),
      requestList: stableCompactStringify(
        skeletons.map((skeleton, index) => ({
          requestId: index,
          rank: skeleton.rank,
          forcedElement: skeleton.forcedElement ?? null,
          source: source ?? 'system',
        })),
      ),
    });
    try {
      const result = await generateAiArray({
        system,
        prompt: user,
        elementSchema: SpiritSeedAISchema,
        name: 'SpiritSeedList',
        sceneId: 'spirit-seed-generation',
        maxOutputTokens: 6_000,
      });
      if (result.output.length !== skeletons.length)
        throw new Error('spirit seed generation count mismatch');
      return result.output.map((generated, index) => {
        const skeleton = skeletons[index];
        const element = skeleton.forcedElement ?? generated.element;
        const entropy = stableCompactStringify({
          name: generated.name,
          rank: skeleton.rank,
          element,
          spec: generated.details.seedSpec,
          source,
        });
        return {
          name: generated.name,
          description: generated.description,
          element,
          details: createSpiritSeedDetails(
            entropy,
            source,
            generated.details.seedSpec,
          ),
        };
      });
    } catch (error) {
      console.error('[SpiritSeedGenerator] generation failed:', error);
      return skeletons.map((skeleton, index) =>
        buildFallback(skeleton, index, source),
      );
    }
  }
}

export const DEFAULT_SPIRIT_SEED_SEMANTIC_TAG =
  CreationTags.MATERIAL.SEMANTIC_LIFE;
