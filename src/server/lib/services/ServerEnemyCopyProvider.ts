import { renderPrompt } from '@server/lib/prompts';
import { generateAiObject } from '@server/utils/aiClient';
import { stableCompactStringify, truncateText } from '@server/utils/llmPayload';
import type {
  EnemyCopyPayload,
  EnemyCopyProvider,
} from '@shared/engine/enemy-generation/EnemyCopyProvider';
import type { EnemyGenerationDraft } from '@shared/engine/enemy-generation/types';
import { z } from 'zod';

const characterCopyFieldSchemas = {
  name: z.string().min(2).max(12),
  title: z.string().min(2).max(16),
  background: z.string().min(10).max(240),
  description: z.string().min(8).max(120),
} as const;

type CharacterCopyField = keyof typeof characterCopyFieldSchemas;
type GeneratedEnemyCopyPayload = {
  character: Partial<EnemyCopyPayload['character']>;
  products: Array<{
    index: number;
    name: string;
    description: string;
  }>;
};

function createEnemyCopySchema(draft: EnemyGenerationDraft) {
  const characterShape: Record<string, z.ZodType> = {};
  for (const field of Object.keys(
    characterCopyFieldSchemas,
  ) as CharacterCopyField[]) {
    if (draft.missingNarrative[field]) {
      characterShape[field] = characterCopyFieldSchemas[field];
    }
  }

  return z.object({
    character: z.object(characterShape),
    products: z
      .array(
        z.object({
          index: z
            .number()
            .int()
            .min(0)
            .max(Math.max(0, draft.copyFacts.products.length - 1)),
          name: z.string().min(2).max(18),
          description: z.string().min(8).max(120),
        }),
      )
      .length(draft.copyFacts.products.length),
  });
}

const DEFAULT_TIMEOUT_MS = 30_000;

function requestedFieldsFromDraft(draft: EnemyGenerationDraft): string[] {
  return Object.entries(draft.missingNarrative)
    .filter(([, missing]) => missing)
    .map(([field]) => field);
}

function existingCharacterCopyFromDraft(
  draft: EnemyGenerationDraft,
): Partial<Record<'name' | 'title' | 'background' | 'description', string | null>> {
  return {
    ...(draft.missingNarrative.name ? {} : { name: draft.cultivator.name }),
    ...(draft.missingNarrative.title ? {} : { title: draft.cultivator.title ?? null }),
    ...(draft.missingNarrative.background
      ? {}
      : { background: draft.cultivator.background ?? null }),
    ...(draft.missingNarrative.description
      ? {}
      : { description: draft.cultivator.description ?? null }),
  };
}

export function buildEnemyNarrativeFacts(draft: EnemyGenerationDraft) {
  return {
    race: draft.copyFacts.race,
    realm: draft.copyFacts.realm,
    realmStage: draft.copyFacts.realmStage,
    difficulty: draft.copyFacts.difficulty,
    difficultyFactor: draft.copyFacts.difficultyFactor,
    bodyCultivation: draft.copyFacts.bodyCultivation,
    isBoss: draft.input.isBoss,
    primaryElement: draft.copyFacts.primaryElement,
    secondaryElement: draft.copyFacts.secondaryElement,
    profileTags: draft.copyFacts.profileTags,
    personaTags: draft.copyFacts.personaTags,
    characterRequest: {
      requestedFields: requestedFieldsFromDraft(draft),
      existingCopy: existingCharacterCopyFromDraft(draft),
    },
    products: draft.copyFacts.products.map((product, index) => ({
      index,
      productType: product.productType,
      role: product.role,
      quality: product.quality,
      element: product.element,
      slot: product.slot,
      narrativeTags: product.narrativeTags,
      abilityTags: product.abilityTags.slice(0, 6),
      affixNames: product.affixNames.slice(0, 4),
      designHint: truncateText(product.fallbackDescription, 56),
    })),
  };
}

export class ServerEnemyCopyProvider implements EnemyCopyProvider {
  private readonly enabled: boolean;
  private readonly timeoutMs: number;

  constructor(options: { enabled?: boolean; timeoutMs?: number } = {}) {
    this.enabled =
      options.enabled ?? ServerEnemyCopyProvider.resolveDefaultEnabled();
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  private static resolveDefaultEnabled(): boolean {
    if (process.env.DISABLE_LLM_NARRATIVE === 'true') return false;
    if (process.env.ENABLE_LLM_NARRATIVE === 'false') return false;
    return true;
  }

  async enrich(
    draft: EnemyGenerationDraft,
  ): Promise<EnemyCopyPayload | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const factsJson = stableCompactStringify(buildEnemyNarrativeFacts(draft));
      const { system, user } = renderPrompt('enemy-narrative', {
        factsJson,
      });
      const response = await this.withTimeout(
        generateAiObject({
          system,
          prompt: user,
          schema: createEnemyCopySchema(draft),
          name: 'EnemyCopyPayload',
          sceneId: 'enemy-narrative',
        }),
      );
      const generated = response.output as GeneratedEnemyCopyPayload;
      const products = generated.products.map((product) => ({
        id: draft.copyFacts.products[product.index]!.id,
        name: product.name,
        description: product.description,
      }));

      return {
        character: {
          name: draft.missingNarrative.name
            ? generated.character.name!
            : draft.cultivator.name,
          title: draft.missingNarrative.title
            ? generated.character.title!
            : (draft.cultivator.title ?? ''),
          background: draft.missingNarrative.background
            ? generated.character.background!
            : (draft.cultivator.background ?? ''),
          description: draft.missingNarrative.description
            ? generated.character.description!
            : (draft.cultivator.description ?? ''),
        },
        products,
      };
    } catch (error) {
      console.error('[ServerEnemyCopyProvider] copy generation failed:', error);
      return null;
    }
  }

  private async withTimeout<T>(promise: Promise<T>): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(
          () => reject(new Error('Enemy copy generation timeout')),
          this.timeoutMs,
        );
      }),
    ]);
  }
}
