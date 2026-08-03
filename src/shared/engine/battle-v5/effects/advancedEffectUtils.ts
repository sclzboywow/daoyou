import { Buff } from '../buffs/Buff';
import { BuffMatchParams } from '../core/configs';
import type { Unit } from '../units/Unit';
import type {
  AbilityTransformModifierV3,
  CombatMechanicPayloadV3,
} from '../v3/mechanics';
import { EffectExecutionContextV3 } from './Effect';

export function matchesBuff(buff: Buff, match?: BuffMatchParams): boolean {
  if (!match) return true;
  if (match.id && buff.id !== match.id) return false;
  if (match.tags && match.tags.length > 0) {
    return match.tags.some((tag) => buff.tags.hasTag(tag));
  }
  return true;
}

export function findMatchingBuffs(
  target: EffectExecutionContextV3['target'],
  match?: BuffMatchParams,
): Buff[] {
  return target.buffs.getAllBuffs().filter((buff) => matchesBuff(buff, match));
}

export function commitMechanicResultV3(
  context: EffectExecutionContextV3,
  event: {
    code: string;
    payload: CombatMechanicPayloadV3;
    target: Unit;
    visibility?: 'player' | 'debug';
  },
): void {
  if (event.visibility === 'debug') return;
  context.commit(event.target, {
    type: 'mechanic',
    code: event.code,
    payload: event.payload,
  });
}

export function abilityTransformModifiersV3(params: {
  trueDamage?: boolean;
  addDispel?: unknown;
  mpCostToHp?: boolean;
  freeManaCost?: boolean;
  cooldownModify?: number;
  forceCritical?: boolean;
  bonusDamageMemory?: unknown;
}): AbilityTransformModifierV3[] {
  const modifiers: AbilityTransformModifierV3[] = [];
  if (params.trueDamage) modifiers.push({ kind: 'true_damage' });
  if (params.addDispel) modifiers.push({ kind: 'dispel' });
  if (params.mpCostToHp) modifiers.push({ kind: 'mp_cost_to_hp' });
  if (params.freeManaCost) modifiers.push({ kind: 'free_mana_cost' });
  if (params.cooldownModify !== undefined) {
    const cooldownRounds = Math.round(params.cooldownModify);
    if (cooldownRounds !== 0) {
      modifiers.push({ kind: 'cooldown', rounds: cooldownRounds });
    }
  }
  if (params.forceCritical) modifiers.push({ kind: 'force_critical' });
  if (params.bonusDamageMemory) modifiers.push({ kind: 'stored_damage' });
  return modifiers;
}
