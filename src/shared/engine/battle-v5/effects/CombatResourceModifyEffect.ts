import type { CombatResourceModifyParams } from '../core/configs';
import { executeEffectConfigs } from '../core/effectExecutor';
import { EffectRegistry } from '../factories/EffectRegistry';
import { GameplayEffect, type EffectExecutionContextV3 } from './Effect';

export class CombatResourceModifyEffect extends GameplayEffect {
  constructor(private readonly params: CombatResourceModifyParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    const unit =
      this.params.target === 'target' ? context.target : context.caster;
    const before = unit.combatResources.getCurrent(this.params.resourceId);
    let amount = 0;

    switch (this.params.operation) {
      case 'add':
        unit.combatResources.modify(
          this.params.resourceId,
          Math.max(0, this.params.amount ?? 1),
          {
            attribution: context.attribution,
            trace: context.trace,
            caster: context.caster,
            ability: context.ability,
            operation: 'add',
            reason: this.params.reason,
          },
        );
        amount =
          unit.combatResources.getCurrent(this.params.resourceId) - before;
        break;
      case 'subtract':
        amount = unit.combatResources.consume(
          this.params.resourceId,
          Math.max(0, this.params.amount ?? 1),
          {
            attribution: context.attribution,
            trace: context.trace,
            caster: context.caster,
            ability: context.ability,
            operation: 'subtract',
            reason: this.params.reason,
          },
        );
        break;
      case 'set':
        unit.combatResources.set(
          this.params.resourceId,
          this.params.amount ?? 0,
          {
            attribution: context.attribution,
            trace: context.trace,
            caster: context.caster,
            ability: context.ability,
            operation: 'set',
            reason: this.params.reason,
          },
        );
        amount = Math.abs(
          unit.combatResources.getCurrent(this.params.resourceId) - before,
        );
        break;
      case 'consume_all':
        amount = unit.combatResources.consume(this.params.resourceId, 'all', {
          attribution: context.attribution,
          trace: context.trace,
          caster: context.caster,
          ability: context.ability,
          operation: 'consume_all',
          reason: this.params.reason,
        });
        break;
    }

    const repeat = this.params.scaleEffectsByAmount
      ? amount
      : amount > 0
        ? 1
        : 0;
    for (let index = 0; index < repeat; index += 1) {
      if (!context.canExecuteEffect()) break;
      executeEffectConfigs(this.params.effects ?? [], context);
    }
  }
}

EffectRegistry.getInstance().register(
  'combat_resource_modify',
  (params) => new CombatResourceModifyEffect(params),
);
