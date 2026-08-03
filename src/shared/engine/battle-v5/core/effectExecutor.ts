import {
  executeGameplayEffectV3,
  type EffectExecutionContextV3,
} from '../effects/Effect';
import { EffectRegistry } from '../factories/EffectRegistry';
import type { EffectConfig } from './configs';

export function executeEffectConfigs(
  effects: readonly EffectConfig[],
  context: EffectExecutionContextV3,
): void {
  for (const effectConfig of effects) {
    if (!context.canExecuteEffect()) break;
    const effect = EffectRegistry.getInstance().create(effectConfig);
    if (!effect) continue;
    executeGameplayEffectV3(effect, context);
  }
}
