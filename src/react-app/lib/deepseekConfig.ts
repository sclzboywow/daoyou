import {
  DeepSeekByokConfigSchema,
  type DeepSeekByokConfig,
} from '@shared/config/deepseek';

export const DEEPSEEK_STORAGE_KEY = 'daoyou_llm_config';

export function readStoredDeepSeekConfig(
  storage: Pick<Storage, 'getItem'> = window.localStorage,
): DeepSeekByokConfig | null {
  try {
    const raw = storage.getItem(DEEPSEEK_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof parsed.provider === 'string' &&
      parsed.provider !== 'deepseek'
    ) {
      return null;
    }

    const config = DeepSeekByokConfigSchema.safeParse({
      apiKey: parsed.apiKey,
      model: parsed.model,
    });
    return config.success ? config.data : null;
  } catch {
    return null;
  }
}
