import { StatusSpreadParams } from '../core/configs';
import { EffectRegistry } from '../factories/EffectRegistry';
import { EffectExecutionContextV3, GameplayEffect } from './Effect';

export class StatusSpreadEffect extends GameplayEffect {
  constructor(private params: StatusSpreadParams) {
    super();
  }

  execute(context: EffectExecutionContextV3): void {
    void this.params;
    void context;
    // Current battle-v5 main flow is 1v1. Without a second target there is no
    // committed result to publish.
  }
}

EffectRegistry.getInstance().register(
  'status_spread',
  (params) => new StatusSpreadEffect(params),
);
