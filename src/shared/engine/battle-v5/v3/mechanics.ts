export const CombatMechanicCodeV3 = {
  ABILITY_LOCK: 'ability_lock',
  CONTROL_SKIP: 'control_skip',
  COOLDOWN_MODIFY: 'cooldown_modify',
  DAMAGE_DEFER: 'damage_defer',
  HP_SACRIFICE: 'hp_sacrifice',
  MANA_BURN: 'mana_burn',
  NEXT_HIT_RULE: 'next_hit_rule',
  TAG_TRIGGER: 'tag_trigger',
} as const;

export type CombatMechanicOperationV3 =
  'apply' | 'refresh' | 'replace' | 'consume';

export type AbilityTransformModifierV3 =
  | { kind: 'true_damage' }
  | { kind: 'dispel' }
  | { kind: 'mp_cost_to_hp' }
  | { kind: 'free_mana_cost' }
  | { kind: 'cooldown'; rounds: number }
  | { kind: 'force_critical' }
  | { kind: 'stored_damage' };

export type DamageMemoryReleaseKindV3 =
  'damage' | 'heal' | 'shield' | 'reflect' | 'counter' | 'follow_up';

/**
 * 玩家可见机制的完整语义。渲染器只消费这些稳定字段，禁止重新解释内部 key。
 */
export type CombatMechanicPayloadV3 =
  | {
      kind: 'ability_transform';
      triggers: number;
      modifiers: AbilityTransformModifierV3[];
    }
  | {
      kind: 'ability_lock';
      abilityName: string;
      rounds: number;
    }
  | {
      kind: 'tag_trigger';
      label: string;
    }
  | {
      kind: 'hp_sacrifice';
      amount: number;
    }
  | {
      kind: 'damage_defer';
      amount: number;
      turns: number;
    }
  | {
      kind: 'mana_burn';
      amount: number;
    }
  | {
      kind: 'cooldown_change';
      abilityName: string;
      rounds: number;
    }
  | {
      kind: 'damage_memory_record';
      amount: number;
    }
  | {
      kind: 'damage_memory_release';
      amount: number;
      releaseAs: DamageMemoryReleaseKindV3;
    }
  | {
      kind: 'control_skip';
      controlName: string;
    }
  | {
      kind: 'named_trigger';
      label: string;
    }
  | {
      kind: 'status_transition';
      label: string;
      operation: CombatMechanicOperationV3;
      previousLabel?: string;
    };

export const COMBAT_MECHANIC_CUE_KINDS_V3 = [
  'tag_trigger',
  'damage_memory_release',
] as const satisfies readonly CombatMechanicPayloadV3['kind'][];

export type CombatMechanicCueKindV3 =
  (typeof COMBAT_MECHANIC_CUE_KINDS_V3)[number];

export type CombatMechanicCuePayloadV3 = Extract<
  CombatMechanicPayloadV3,
  { kind: CombatMechanicCueKindV3 }
>;

export function isCombatMechanicCuePayloadV3(
  payload: CombatMechanicPayloadV3,
): payload is CombatMechanicCuePayloadV3 {
  return (COMBAT_MECHANIC_CUE_KINDS_V3 as readonly string[]).includes(
    payload.kind,
  );
}
