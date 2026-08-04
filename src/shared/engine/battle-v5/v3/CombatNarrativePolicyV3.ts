import { CombatNarrativeCatalogV3 } from './CombatNarrativeCatalogV3';
import type {
  CombatFactV3,
  CombatLogPresentationModeV3,
  CombatOriginV3,
  CombatSequenceV3,
} from './types';

type StatusFactV3 = Extract<CombatFactV3, { type: 'status' }>;
type ExpiredStatusFactV3 = Extract<StatusFactV3, { operation: 'remove' }>;

export type CombatNarrativeItemV3 =
  | { kind: 'fact'; fact: CombatFactV3 }
  | {
      kind: 'expired_statuses';
      target: CombatFactV3['target'];
      facts: ExpiredStatusFactV3[];
    };

export function combatAttributionKeyV3(origin: CombatOriginV3): string {
  const ownerId = origin.kind === 'owned' ? origin.owner.id : 'system';
  return `${ownerId}:${origin.carrier.kind}:${origin.carrier.id}`;
}

function sameAttribution(left: CombatFactV3, right: CombatFactV3): boolean {
  return (
    combatAttributionKeyV3(left.origin) === combatAttributionKeyV3(right.origin)
  );
}

function sameAppliedStatus(left: CombatFactV3, right: CombatFactV3): boolean {
  return (
    left.type === 'status' &&
    left.operation === 'apply' &&
    right.type === 'status' &&
    right.operation === 'apply' &&
    left.target.id === right.target.id &&
    left.statusId === right.statusId &&
    sameAttribution(left, right) &&
    left.trace.resolutionId === right.trace.resolutionId &&
    !!left.narrative?.causeId &&
    left.narrative?.causeId === right.narrative?.causeId
  );
}

/** 只选择和合并展示项，不生成文案。 */
export class CombatNarrativePolicyV3 {
  constructor(
    readonly mode: CombatLogPresentationModeV3,
    private readonly catalog = new CombatNarrativeCatalogV3(),
  ) {}

  select(sequence: CombatSequenceV3): CombatNarrativeItemV3[] {
    const ordered = [...sequence.facts].sort(
      (left, right) => left.trace.ordinal - right.trace.ordinal,
    );
    const visible = ordered.filter(
      (fact) => !this.shouldHide(fact, ordered, sequence),
    );
    const compacted =
      this.mode === 'concise' ? this.coalesceApplications(visible) : visible;
    return this.groupExpiredStatuses(compacted);
  }

  private shouldHide(
    fact: CombatFactV3,
    facts: CombatFactV3[],
    sequence: CombatSequenceV3,
  ): boolean {
    if (this.mode === 'detailed') return false;
    if (this.isRedundantActionStatus(fact, facts, sequence)) return true;
    if (
      fact.type === 'action_state' &&
      fact.stateType === 'queued_action' &&
      fact.phase === 'triggered' &&
      fact.ability.id === sequence.ability?.id
    ) {
      return true;
    }
    if (fact.type === 'mechanic') {
      const policy = this.catalog.concisePolicy(fact);
      if (policy === 'detailed_only') return true;
      if (policy === 'hide_when_result') {
        return this.hasLinkedResult(fact, facts);
      }
    }
    return false;
  }

  private hasLinkedResult(
    fact: Extract<CombatFactV3, { type: 'mechanic' }>,
    facts: CombatFactV3[],
  ): boolean {
    const causeId = fact.narrative?.causeId;
    if (!causeId || fact.narrative?.role !== 'cue') return false;
    return facts.some(
      (candidate) =>
        candidate.id !== fact.id &&
        candidate.narrative?.causeId === causeId &&
        candidate.narrative.role === 'result',
    );
  }

  private isRedundantActionStatus(
    fact: CombatFactV3,
    facts: CombatFactV3[],
    sequence: CombatSequenceV3,
  ): boolean {
    if (
      fact.type !== 'status' ||
      fact.operation !== 'apply' ||
      sequence.phase !== 'action' ||
      !sequence.actor ||
      !sequence.ability ||
      fact.target.id !== sequence.actor.id ||
      fact.statusName !== sequence.ability.name ||
      fact.origin.kind !== 'owned' ||
      fact.origin.owner.id !== sequence.actor.id ||
      fact.origin.carrier.kind !== 'ability' ||
      fact.origin.carrier.id !== sequence.ability.id ||
      !fact.narrative?.causeId
    ) {
      return false;
    }
    return facts.some(
      (candidate) =>
        candidate.type === 'action_state' &&
        candidate.stateType === 'queued_action' &&
        candidate.phase === 'entered' &&
        candidate.target.id === fact.target.id &&
        candidate.narrative?.causeId === fact.narrative?.causeId,
    );
  }

  private coalesceApplications(facts: CombatFactV3[]): CombatFactV3[] {
    const result: CombatFactV3[] = [];
    for (const fact of facts) {
      const previous = result[result.length - 1];
      if (previous && sameAppliedStatus(previous, fact)) {
        result[result.length - 1] = fact;
      } else {
        result.push(fact);
      }
    }
    return result;
  }

  private groupExpiredStatuses(facts: CombatFactV3[]): CombatNarrativeItemV3[] {
    const result: CombatNarrativeItemV3[] = [];
    for (let index = 0; index < facts.length; index += 1) {
      const fact = facts[index];
      if (
        fact.type !== 'status' ||
        fact.operation !== 'remove' ||
        fact.reason !== 'expired'
      ) {
        result.push({ kind: 'fact', fact });
        continue;
      }
      const expired: ExpiredStatusFactV3[] = [fact];
      while (index + 1 < facts.length) {
        const next = facts[index + 1];
        if (
          next.type !== 'status' ||
          next.operation !== 'remove' ||
          next.reason !== 'expired' ||
          next.target.id !== fact.target.id ||
          !sameAttribution(fact, next) ||
          next.trace.resolutionId !== fact.trace.resolutionId
        ) {
          break;
        }
        expired.push(next);
        index += 1;
      }
      result.push({
        kind: 'expired_statuses',
        target: fact.target,
        facts: expired,
      });
    }
    return result;
  }
}
