import type { EnemyGenerationDraft } from './types';

export interface EnemyCopyPayload {
  character: {
    name: string;
    title: string;
    background: string;
    description: string;
  };
  products: Array<{
    id: string;
    name: string;
    description: string;
  }>;
}

export interface EnemyCopyProvider {
  enrich(draft: EnemyGenerationDraft): Promise<EnemyCopyPayload | null>;
}

export class NoopEnemyCopyProvider implements EnemyCopyProvider {
  async enrich(): Promise<null> {
    return null;
  }
}
