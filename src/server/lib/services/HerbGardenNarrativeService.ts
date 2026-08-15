import { renderPrompt } from '@server/lib/prompts';
import { generateAiObject } from '@server/utils/aiClient';
import { stableCompactStringify, truncateText } from '@server/utils/llmPayload';
import {
  STAGE_ASSESSMENT_VALUES,
  type ActiveHerbGardenStage,
  type HerbGardenOutcomeKind,
  type HerbGardenStageRecord,
  type StageAssessment,
  type StageRuleResolution,
  type SpiritSeedSpec,
} from '@shared/contracts/herbGarden';
import type { ElementType, Quality } from '@shared/types/constants';
import { z } from 'zod';

const stageAssessmentSchema = z
  .object({
    fit: z.enum(STAGE_ASSESSMENT_VALUES),
    manifestation: z.string().min(2).max(40).regex(/^[a-z0-9_]+$/),
    discoveredHint: z.string().min(12).max(80),
    narrative: z.string().min(20).max(140),
  })
  .strict();

const outcomeNamingSchema = z
  .object({
    name: z.string().min(2).max(12),
    description: z.string().min(20).max(140),
  })
  .strict();

export interface HerbGardenStageNarrative {
  assessment: StageAssessment;
  manifestation: string;
  discoveredHint: string;
  narrative: string;
}

export interface HerbGardenOutcomeCopy {
  name: string;
  description: string;
}

const DEFAULT_TIMEOUT_MS = 30_000;

async function withTimeout<T>(promise: Promise<T>, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error(message)),
          DEFAULT_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const HerbGardenNarrativeService = {
  async assessStage(input: {
    seed: {
      name: string;
      description?: string;
      rank: Quality;
      element?: ElementType;
      spec: SpiritSeedSpec;
    };
    stage: ActiveHerbGardenStage;
    actionName: string;
    methodTags: string[];
    environmentTags: string[];
    material?: { name: string; rank: Quality; element?: ElementType };
    rootElement?: ElementType;
    rule: StageRuleResolution;
  }): Promise<HerbGardenStageNarrative | null> {
    try {
      const { system, user } = renderPrompt('spirit-seed-stage-assessment', {
        factsJson: stableCompactStringify({
          seed: {
            name: input.seed.name,
            description: truncateText(input.seed.description ?? '', 120),
            rank: input.seed.rank,
            element: input.seed.element,
            hiddenSpec: input.seed.spec,
          },
          stage: input.stage,
          actionName: input.actionName,
          methodTags: input.methodTags,
          environmentTags: input.environmentTags,
          material: input.material,
          rootElement: input.rootElement,
          allowedFits: input.rule.allowedAssessments,
        }),
      });
      const result = await withTimeout(
        generateAiObject({
          system,
          prompt: user,
          schema: stageAssessmentSchema,
          name: 'SpiritSeedStageAssessment',
          sceneId: 'spirit-seed-stage-assessment',
          maxOutputTokens: 1_000,
        }),
        'LLM spirit seed stage assessment timeout',
      );
      if (!input.rule.allowedAssessments.includes(result.output.fit)) {
        console.warn('[HerbGardenNarrativeService] rejected out-of-bound fit', {
          fit: result.output.fit,
          allowed: input.rule.allowedAssessments,
        });
        return null;
      }
      return {
        assessment: result.output.fit,
        manifestation: result.output.manifestation,
        discoveredHint: result.output.discoveredHint,
        narrative: result.output.narrative,
      };
    } catch (error) {
      console.error('[HerbGardenNarrativeService] stage narrative failed:', error);
      return null;
    }
  },

  async nameOutcome(input: {
    seed: {
      name: string;
      description?: string;
      rank: Quality;
      element?: ElementType;
    };
    kind: HerbGardenOutcomeKind;
    quality: Quality;
    quantity: number;
    history: HerbGardenStageRecord[];
  }): Promise<HerbGardenOutcomeCopy | null> {
    try {
      const { system, user } = renderPrompt('spirit-plant-outcome-naming', {
        factsJson: stableCompactStringify({
          sourceSeed: input.seed,
          settledOutcome: {
            kind: input.kind,
            quality: input.quality,
            quantity: input.quantity,
          },
          cultivationHistory: input.history.map((record) => ({
            stage: record.stage,
            actionName: record.actionName,
            assessment: record.assessment,
            manifestation: record.manifestation,
            discoveredHint: record.discoveredHint,
          })),
        }),
      });
      const result = await withTimeout(
        generateAiObject({
          system,
          prompt: user,
          schema: outcomeNamingSchema,
          name: 'SpiritPlantOutcomeCopy',
          sceneId: 'spirit-plant-outcome-naming',
          maxOutputTokens: 1_000,
        }),
        'LLM spirit plant outcome naming timeout',
      );
      return result.output;
    } catch (error) {
      console.error('[HerbGardenNarrativeService] outcome naming failed:', error);
      return null;
    }
  },
};
