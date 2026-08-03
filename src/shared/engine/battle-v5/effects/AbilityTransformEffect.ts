import { AbilityTransformParams } from '../core/configs';
import { addAbilityTransform } from '../core/runtimeState';
import { EffectRegistry } from '../factories/EffectRegistry';
import { EffectExecutionContextV3, GameplayEffect } from './Effect';
import {
  abilityTransformModifiersV3,
  commitMechanicResultV3,
} from './advancedEffectUtils';

export class AbilityTransformEffect extends GameplayEffect {
  constructor(private params: AbilityTransformParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    const modifiers = abilityTransformModifiersV3(this.params);
    addAbilityTransform(context.caster, {
      id: this.params.id,
      remainingTriggers: Math.max(1, this.params.triggers ?? 1),
      appliesToTags: this.params.appliesToTags,
      trueDamage: this.params.trueDamage,
      addDispel: this.params.addDispel
        ? { type: 'dispel', params: this.params.addDispel }
        : undefined,
      mpCostToHp: this.params.mpCostToHp,
      freeManaCost: this.params.freeManaCost,
      cooldownModify: this.params.cooldownModify,
      forceCritical: this.params.forceCritical,
      bonusDamageMemory: this.params.bonusDamageMemory,
    });
    if (modifiers.length > 0) {
      commitMechanicResultV3(context, {
        code: this.params.id,
        target: context.caster,
        payload: {
          kind: 'ability_transform',
          triggers: Math.max(1, this.params.triggers ?? 1),
          modifiers,
        },
      });
    }
  }
}

EffectRegistry.getInstance().register(
  'ability_transform',
  (params) => new AbilityTransformEffect(params),
);
