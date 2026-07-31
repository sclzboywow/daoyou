import { z } from 'zod';

export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash';

export const DeepSeekByokConfigSchema = z
  .object({
    apiKey: z.string().trim().min(1).max(512),
    model: z.string().trim().min(1).max(128),
  })
  .strict();

export type DeepSeekByokConfig = z.infer<typeof DeepSeekByokConfigSchema>;
