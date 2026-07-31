import type { AuthUser } from '@server/lib/auth/types';
import type { DeepSeekByokConfig } from '@shared/config/deepseek';
export type ActiveCultivatorRef = {
  userId: string;
  cultivatorId: string;
  status: 'active';
};

export type AppVariables = {
  user: AuthUser;
  activeCultivatorRef: ActiveCultivatorRef;
  llmConfig: DeepSeekByokConfig;
  validatedJson: unknown;
  validatedQuery: unknown;
};

export type AppEnv = {
  Variables: Partial<AppVariables>;
};
