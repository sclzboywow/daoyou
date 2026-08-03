import { GameplayTags } from '@shared/engine/shared/tag-domain';
import type { Ability } from '../abilities/Ability';
import type { Buff } from '../buffs/Buff';
import type { Unit } from '../units/Unit';
import type { CombatCarrierV3, CombatOriginV3 } from './types';

export const CombatSystemSourceV3 = {
  ACTION_FLOW: { kind: 'system', id: 'action_flow', name: '行动流程' },
  RESOURCE_DECAY: {
    kind: 'system',
    id: 'resource_decay',
    name: '资源衰减',
  },
} as const;

export type CombatSystemSourceV3 = Readonly<{
  kind: 'system';
  id: string;
  name: string;
}>;

export class CombatAttributionV3 {
  readonly owner: Unit;
  readonly origin: CombatOriginV3;

  private constructor(owner: Unit, origin: CombatOriginV3) {
    this.owner = owner;
    this.origin = freezeCombatOriginV3(origin);
    Object.freeze(this);
  }

  static owned(owner: Unit, carrier: CombatCarrierV3): CombatAttributionV3 {
    if (!carrier.id || !carrier.name) {
      throw new Error('Owned combat attribution has an incomplete carrier');
    }
    return new CombatAttributionV3(owner, {
      kind: 'owned',
      owner: { id: owner.id, name: owner.name },
      carrier: Object.freeze({ ...carrier }),
    });
  }

  static fromAbility(owner: Unit, ability: Ability): CombatAttributionV3 {
    return CombatAttributionV3.owned(
      owner,
      combatCarrierFromAbilityV3(ability),
    );
  }

  static system(
    owner: Unit,
    source: CombatSystemSourceV3,
  ): CombatAttributionV3 {
    return new CombatAttributionV3(owner, {
      kind: 'system',
      carrier: source,
    });
  }

  static rebind(owner: Unit, origin: CombatOriginV3): CombatAttributionV3 {
    if (origin.kind === 'owned' && origin.owner.id !== owner.id) {
      throw new Error(
        `Combat attribution owner mismatch: ${owner.id} !== ${origin.owner.id}`,
      );
    }
    return new CombatAttributionV3(owner, origin);
  }
}

export function freezeCombatOriginV3(origin: CombatOriginV3): CombatOriginV3 {
  if (origin.kind === 'system') {
    return Object.freeze({
      kind: 'system',
      carrier: Object.freeze({ ...origin.carrier }),
    });
  }
  return Object.freeze({
    kind: 'owned',
    owner: Object.freeze({ ...origin.owner }),
    carrier: Object.freeze({ ...origin.carrier }),
  });
}

export function combatCarrierFromAbilityV3(ability: Ability): CombatCarrierV3 {
  const kind = ability.tags.hasTag(GameplayTags.ABILITY.KIND.ARTIFACT)
    ? 'equipment'
    : ability.tags.hasTag(GameplayTags.ABILITY.KIND.GONGFA)
      ? 'gongfa'
      : 'ability';
  return { kind, id: ability.id, name: ability.name };
}

export function combatAttributionFromBuffV3(buff: Buff): CombatAttributionV3 {
  const attribution = buff.getCombatAttributionV3();
  if (!attribution) {
    throw new Error(`Buff ${buff.id} has no CombatAttributionV3`);
  }
  return attribution;
}
