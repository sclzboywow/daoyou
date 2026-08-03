import type { CombatEvent } from '../core/types';
import type { Unit } from '../units/Unit';
import type {
  CombatFactDraftV3,
  CombatNarrativeRelationV3,
} from './types';

export const CombatV3EventType = {
  RESULT_COMMITTED: 'CombatResultCommittedEventV3',
} as const;

/** Immutable, player-visible outcome. Battle mechanics must not subscribe to it. */
export interface CombatResultCommittedEventV3 extends CombatEvent {
  readonly type: typeof CombatV3EventType.RESULT_COMMITTED;
  readonly target: Unit;
  readonly result: CombatFactDraftV3;
  readonly narrative?: CombatNarrativeRelationV3;
}
