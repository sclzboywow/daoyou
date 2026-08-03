import type { Ability, AbilityCastSnapshot } from '../../abilities/Ability';
import { PassiveAbility } from '../../abilities/PassiveAbility';
import type { Buff } from '../../buffs/Buff';
import { EventBus } from '../../core/EventBus';
import type { CombatEvent, LogCauseRef } from '../../core/types';
import {
  EffectExecutionContextV3,
  executeGameplayEffectV3,
  type GameplayEffect,
} from '../../effects/Effect';
import type { Unit } from '../../units/Unit';
import type { CombatTraceV3 } from '../../v3/types';

const TEST_EFFECT_SOURCE = {
  kind: 'system',
  id: 'test_effect',
  name: '测试效果',
} as const;

interface TestEffectExecutionInput {
  owner?: Unit;
  caster: Unit;
  target: Unit;
  trace?: CombatTraceV3;
  ability?: Ability;
  buff?: Buff;
  castSnapshot?: AbilityCastSnapshot;
  damageCause?: LogCauseRef;
  triggerEvent?: CombatEvent;
}

export function executeTestEffect(
  effect: GameplayEffect | undefined,
  input: TestEffectExecutionInput,
): void {
  if (!effect) throw new Error('Expected gameplay effect');
  const owner = input.owner ?? input.caster;
  const trace = input.trace ?? EventBus.instance.reserveTrace();
  const context =
    input.ability instanceof PassiveAbility
      ? EffectExecutionContextV3.passiveAbility({
          ...input,
          trace,
          owner,
          ability: input.ability,
        })
      : input.ability
        ? EffectExecutionContextV3.activeAbility({
            ...input,
            trace,
            owner,
            ability: input.ability,
          })
        : input.buff
          ? EffectExecutionContextV3.buff({
              ...input,
              trace,
              owner,
              buff: input.buff,
            })
          : EffectExecutionContextV3.system({
              ...input,
              trace,
              owner,
              source: TEST_EFFECT_SOURCE,
            });
  executeGameplayEffectV3(effect, context);
}
