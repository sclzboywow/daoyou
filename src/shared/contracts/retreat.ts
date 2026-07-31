import type {
  BreakthroughResult,
  CultivationResult,
} from '@shared/engine/cultivation/CultivationEngine';
import type { PlayerResourceMutationMeta } from './player';

export type RetreatAction = 'cultivate' | 'breakthrough';
export type RetreatStoryType = 'breakthrough' | 'lifespan';

export interface RetreatResultData {
  summary: BreakthroughResult['summary'] | CultivationResult['summary'];
  action: RetreatAction;
  story?: string;
  storyType?: RetreatStoryType | null;
  depleted?: boolean;
}

export type RetreatStreamEvent =
  | {
      type: 'result';
      data: RetreatResultData;
    }
  | {
      type: 'state';
      state: PlayerResourceMutationMeta;
    }
  | {
      type: 'chunk';
      text: string;
    }
  | {
      type: 'error';
      error: string;
    };
