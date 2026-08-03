import { Ability } from '../../abilities/Ability';
import { StackRule } from '../../buffs/Buff';
import { checkConditions } from '../../core/conditionEvaluator';
import { EventBus } from '../../core/EventBus';
import type { HealEvent } from '../../core/events';
import {
  AbilityType,
  AttributeType,
  BuffType,
  ModifierType,
} from '../../core/types';
import { BuffFactory } from '../../factories/BuffFactory';
import { EffectRegistry } from '../../factories/EffectRegistry';
import { BuffCopyEffect } from '../../effects/BuffCopyEffect';
import { calculateSpiritualRootDamageMultiplier } from '../../systems/spiritualRootResonance';
import { Unit } from '../../units/Unit';
import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeTestEffect } from '../setup/executeTestEffect';

function unit(id: string): Unit {
  return new Unit(id, id, {});
}

describe('天衍所需通用 battle-v5 扩展', () => {
  beforeEach(() => {
    EventBus.instance.reset();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    EventBus.instance.reset();
  });

  it('灵根匹配优先于异灵根失配豁免', () => {
    const caster = unit('caster');
    caster.setSpiritualRoots([{ element: '火', strength: 80 }]);
    const ability = new Ability('fire', '火法', AbilityType.ACTIVE_SKILL);
    ability.tags.addTags([
      GameplayTags.ABILITY.ELEMENT.FIRE,
      GameplayTags.ABILITY.MECHANIC.IGNORE_SPIRITUAL_ROOT_MISMATCH,
    ]);

    expect(calculateSpiritualRootDamageMultiplier({ caster, ability })).toBe(1.16);
  });

  it('元素失配统一按1.0结算且兼容旧豁免标签', () => {
    const caster = unit('caster');
    caster.setSpiritualRoots([{ element: '水', strength: 80 }]);
    const exempt = new Ability('fire-exempt', '火法', AbilityType.ACTIVE_SKILL);
    exempt.tags.addTags([
      GameplayTags.ABILITY.ELEMENT.FIRE,
      GameplayTags.ABILITY.MECHANIC.IGNORE_SPIRITUAL_ROOT_MISMATCH,
    ]);
    const ordinary = new Ability('fire-normal', '寻常火法', AbilityType.ACTIVE_SKILL);
    ordinary.tags.addTags([GameplayTags.ABILITY.ELEMENT.FIRE]);

    expect(calculateSpiritualRootDamageMultiplier({ caster, ability: exempt })).toBe(1);
    expect(calculateSpiritualRootDamageMultiplier({ caster, ability: ordinary })).toBe(1);
  });

  it('无属性伤害取最高灵根正常共鸣加成的30%', () => {
    const caster = unit('caster');
    caster.setSpiritualRoots([
      { element: '水', strength: 80 },
      { element: '雷', strength: 95 },
    ]);
    const ability = new Ability('neutral', '无属性法', AbilityType.ACTIVE_SKILL);

    expect(calculateSpiritualRootDamageMultiplier({ caster, ability })).toBe(1.057);
    expect(calculateSpiritualRootDamageMultiplier({ ability })).toBe(1);
  });

  it('countsAsStatus=false 的机制状态不进入普通状态计数但仍可显式查找', () => {
    const caster = unit('caster');
    const seal = BuffFactory.create({
      id: 'test.seal',
      name: '法印',
      type: BuffType.BUFF,
      duration: 2,
      stackRule: StackRule.OVERRIDE,
      dispelPolicy: 'protected',
      countsAsStatus: false,
      tags: [GameplayTags.BUFF.TYPE.BUFF],
    });
    caster.buffs.addBuff(seal, caster);

    expect(checkConditions(
      { caster, target: caster },
      [{ type: 'buff_count_at_least', params: { scope: 'caster', value: 1 } }],
    )).toBe(false);
    expect(checkConditions(
      { caster, target: caster },
      [{ type: 'buff_layer_at_least', params: { scope: 'caster', id: 'test.seal', value: 1 } }],
    )).toBe(true);
  });

  it('source_has_tag 可统一匹配能力来源或Buff来源标签', () => {
    const caster = unit('caster');
    const target = unit('target');
    const tag = GameplayTags.ABILITY.ELEMENT.WOOD;
    const ability = new Ability('wood-heal', '木行治疗', AbilityType.ACTIVE_SKILL);
    ability.tags.addTags([tag]);
    const sourceBuff = BuffFactory.create({
      id: 'wood-hot',
      name: '木行持续治疗',
      type: BuffType.BUFF,
      duration: 2,
      tags: [tag],
    });
    const conditions = [{
      type: 'source_has_tag' as const,
      params: { tag },
    }];

    expect(checkConditions({ caster, target, ability }, conditions)).toBe(true);
    expect(checkConditions({
      caster,
      target,
      triggerEvent: { buff: sourceBuff },
    }, conditions)).toBe(true);
  });

  it('protected 机制状态不会被通用Buff复制效果复制', () => {
    const caster = unit('caster');
    const target = unit('target');
    target.buffs.addBuff(BuffFactory.create({
      id: 'test.protected-seal',
      name: '受保护法印',
      type: BuffType.BUFF,
      duration: 2,
      dispelPolicy: 'protected',
    }), target);

    executeTestEffect(new BuffCopyEffect({
      match: { id: 'test.protected-seal' },
      target: 'caster',
    }), { caster, target });

    expect(caster.buffs.getAllBuffIds()).not.toContain('test.protected-seal');
  });

  it('单次控制效果可追加控制命中且不修改施法者全局属性', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const caster = unit('caster');
    const target = unit('target');
    target.attributes.addModifier({
      id: 'control-resistance',
      attrType: AttributeType.CONTROL_RESISTANCE,
      type: ModifierType.OVERRIDE,
      value: 0.5,
      source: 'test',
    });
    target.updateDerivedStats();
    const before = caster.attributes.getValue(AttributeType.CONTROL_HIT);

    executeTestEffect(EffectRegistry.getInstance().create({
      type: 'apply_buff',
      params: {
        controlHitBonus: 0.5,
        target: 'target',
        buffConfig: {
          id: 'test.scoped-control',
          name: '定身',
          type: BuffType.CONTROL,
          duration: 1,
          stackRule: StackRule.REFRESH_DURATION,
        },
      },
    }), { caster, target });

    expect(target.buffs.getAllBuffIds()).toContain('test.scoped-control');
    expect(caster.attributes.getValue(AttributeType.CONTROL_HIT)).toBe(before);
  });

  it('兼容按施法快照比例返还实际支付法力', () => {
    const caster = unit('caster');
    const target = unit('target');
    const before = caster.getCurrentMp();
    caster.consumeMp(50);
    const events: HealEvent[] = [];
    EventBus.instance.subscribe<HealEvent>('HealEvent', (event) => events.push(event));

    executeTestEffect(EffectRegistry.getInstance().create({
      type: 'refund_paid_cost',
      params: { ratio: 0.2 },
    }), {
      caster,
      target,
      castSnapshot: {
        target,
        targetId: target.id,
        costs: [],
        casterHpBeforeCost: caster.getCurrentHp(),
        casterHpAfterCost: caster.getCurrentHp(),
        casterHpRatioAfterCost: 1,
        casterMpBeforeCost: before,
        casterMpAfterCost: before - 50,
        targetHpBeforeEffects: target.getCurrentHp(),
        targetHpRatioBeforeEffects: 1,
      },
    });

    expect(caster.getCurrentMp()).toBe(before - 40);
    expect(events.at(-1)).toMatchObject({ healAmount: 10, healType: 'mp' });
  });

  it('固定返还不超过本次实际支付法力', () => {
    const caster = unit('caster');
    const target = unit('target');
    const before = caster.getCurrentMp();
    caster.consumeMp(50);
    const events: HealEvent[] = [];
    EventBus.instance.subscribe<HealEvent>('HealEvent', (event) => events.push(event));

    executeTestEffect(EffectRegistry.getInstance().create({
      type: 'refund_paid_cost',
      params: { amount: 80 },
    }), {
      caster,
      target,
      castSnapshot: {
        target,
        targetId: target.id,
        costs: [],
        casterHpBeforeCost: caster.getCurrentHp(),
        casterHpAfterCost: caster.getCurrentHp(),
        casterHpRatioAfterCost: 1,
        casterMpBeforeCost: before,
        casterMpAfterCost: before - 50,
        targetHpBeforeEffects: target.getCurrentHp(),
        targetHpRatioBeforeEffects: 1,
      },
    });

    expect(caster.getCurrentMp()).toBe(before);
    expect(events.at(-1)).toMatchObject({
      healAmount: 50,
      appliedAmount: 50,
      healType: 'mp',
    });
  });

  it('未实际支付法力时固定返还不产生回蓝事件', () => {
    const caster = unit('caster');
    const target = unit('target');
    const before = caster.getCurrentMp();
    const events: HealEvent[] = [];
    EventBus.instance.subscribe<HealEvent>('HealEvent', (event) => events.push(event));

    executeTestEffect(EffectRegistry.getInstance().create({
      type: 'refund_paid_cost',
      params: { amount: 20 },
    }), {
      caster,
      target,
      castSnapshot: {
        target,
        targetId: target.id,
        costs: [],
        casterHpBeforeCost: caster.getCurrentHp(),
        casterHpAfterCost: caster.getCurrentHp(),
        casterHpRatioAfterCost: 1,
        casterMpBeforeCost: before,
        casterMpAfterCost: before,
        targetHpBeforeEffects: target.getCurrentHp(),
        targetHpRatioBeforeEffects: 1,
      },
    });

    expect(caster.getCurrentMp()).toBe(before);
    expect(events).toHaveLength(0);
  });

  it('固定返还受到最大法力上限截断', () => {
    const caster = unit('caster');
    const target = unit('target');
    const before = caster.getCurrentMp();
    caster.consumeMp(5);
    const events: HealEvent[] = [];
    EventBus.instance.subscribe<HealEvent>('HealEvent', (event) => events.push(event));

    executeTestEffect(EffectRegistry.getInstance().create({
      type: 'refund_paid_cost',
      params: { amount: 20 },
    }), {
      caster,
      target,
      castSnapshot: {
        target,
        targetId: target.id,
        costs: [],
        casterHpBeforeCost: before,
        casterHpAfterCost: before,
        casterHpRatioAfterCost: 1,
        casterMpBeforeCost: before + 45,
        casterMpAfterCost: before - 5,
        targetHpBeforeEffects: target.getCurrentHp(),
        targetHpRatioBeforeEffects: 1,
      },
    });

    expect(caster.getCurrentMp()).toBe(before);
    expect(events.at(-1)).toMatchObject({
      healAmount: 20,
      appliedAmount: 5,
      healType: 'mp',
    });
  });

});
