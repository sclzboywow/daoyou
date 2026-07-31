import { CREATION_PROJECTION_BALANCE } from '../../config/CreationBalance';
import { Rule } from '../core/Rule';
import { RuleContext } from '../core/RuleContext';
import { CompositionDecision } from '../contracts/CompositionDecision';
import { CompositionFacts } from '../contracts/CompositionFacts';

/**
 * EnergyConversionRules
 * 把能量预算换算为技能排序权重并写入 decision.energyConversion。
 * 只与 active_skill 产物相关；passive 产物无需换算，此规则成为 no-op。
 * mpCost/cooldown 依赖完整 projection effects，由 ProjectionRules 统一计算。
 */
export class EnergyConversionRules
  implements Rule<CompositionFacts, CompositionDecision>
{
  readonly id = 'composition.energy_conversion';

  apply({ facts, decision }: RuleContext<CompositionFacts, CompositionDecision>): void {
    if (facts.productType !== 'skill') return;

    const { affixes } = facts;
    const priority =
      CREATION_PROJECTION_BALANCE.skillPriorityBase + affixes.length;

    decision.energyConversion = { priority };

    decision.trace.push({
      ruleId: this.id,
      outcome: 'applied',
      message: `技能排序权重：priority=${priority}`,
    });
  }
}
