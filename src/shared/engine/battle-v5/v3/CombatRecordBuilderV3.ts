import type { EventBus } from '../core/EventBus';
import { EventPriorityLevel } from '../core/events';
import { CombatFactProjectorV3 } from './CombatFactProjectorV3';
import { CombatV3EventType, type CombatResultCommittedEventV3 } from './events';
import type {
  CombatSequenceScopeV3,
  CombatSequenceV3,
  ResolvedCombatSequenceScopeV3,
} from './types';

export class CombatRecordBuilderV3 {
  private readonly sequences = new Map<string, CombatSequenceV3>();
  private readonly sequenceOrder: string[] = [];
  private readonly projector = new CombatFactProjectorV3();
  private readonly resultHandler = (event: CombatResultCommittedEventV3) => {
    const sequenceId = event.trace?.sequenceId;
    const sequence = sequenceId ? this.sequences.get(sequenceId) : undefined;
    if (!sequence) {
      throw new Error(
        `Committed combat result references unknown sequence: ${sequenceId}`,
      );
    }
    sequence.facts.push(this.projector.project(event));
  };

  constructor(private readonly eventBus: EventBus) {
    eventBus.subscribe(
      CombatV3EventType.RESULT_COMMITTED,
      this.resultHandler,
      EventPriorityLevel.COMBAT_LOG,
    );
  }

  runInSequence<T>(
    scope: CombatSequenceScopeV3,
    callback: (scope: ResolvedCombatSequenceScopeV3) => T,
  ): T {
    return this.eventBus.runInSequence(scope, (resolved) => {
      if (this.sequences.has(resolved.id)) {
        throw new Error(`Duplicate CombatSequenceV3 id: ${resolved.id}`);
      }
      this.sequences.set(resolved.id, { ...resolved, facts: [] });
      this.sequenceOrder.push(resolved.id);
      try {
        return callback(resolved);
      } finally {
        const sequence = this.sequences.get(resolved.id)!;
        sequence.actor = resolved.actor;
        sequence.ability = resolved.ability;
      }
    });
  }

  getSequences(): CombatSequenceV3[] {
    return this.sequenceOrder.map((id) => {
      const sequence = this.sequences.get(id)!;
      return {
        ...sequence,
        facts: [...sequence.facts].sort(
          (left, right) => left.trace.ordinal - right.trace.ordinal,
        ),
      };
    });
  }

  destroy(): void {
    this.eventBus.unsubscribe(
      CombatV3EventType.RESULT_COMMITTED,
      this.resultHandler,
    );
  }
}
