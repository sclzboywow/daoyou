import type { CombatResultCommittedEventV3 } from './events';
import type { CombatFactV3 } from './types';

export class CombatFactProjectorV3 {
  project(event: CombatResultCommittedEventV3): CombatFactV3 {
    if (!event.trace) throw new Error('Committed combat result has no trace');
    if (!event.origin) throw new Error('Committed combat result has no origin');
    return Object.freeze({
      ...event.result,
      id: event.trace.eventId,
      trace: event.trace,
      origin: event.origin,
      target: Object.freeze({ id: event.target.id, name: event.target.name }),
      ...(event.narrative ? { narrative: event.narrative } : {}),
    }) as CombatFactV3;
  }
}
