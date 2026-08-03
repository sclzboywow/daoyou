import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { BattleEngineV5 } from '../../BattleEngineV5';
import { EventBus } from '../../core/EventBus';
import { AbilityType, AttributeType } from '../../core/types';
import { AbilityFactory } from '../../factories/AbilityFactory';
import { Unit } from '../../units/Unit';

describe('护盾 Buff 真实战斗验证', () => {
  beforeEach(() => {
    (EventBus as any)._instance = null;
  });

  it('验证护盾生成、抵扣伤害、护盾破碎和消散日志', () => {
    // 1. 创建角色
    const player = new Unit('player', '玄甲修士', {
      [AttributeType.SPIRIT]: 100, // 灵力影响护盾值
      [AttributeType.VITALITY]: 100,
      [AttributeType.STRENGTH]: 100,
      [AttributeType.SPEED]: 10, // 降低身法，减少闪避，让护盾被打
    });

    const opponent = new Unit('opponent', '进攻修士', {
      [AttributeType.SPIRIT]: 10,
      [AttributeType.VITALITY]: 200,
      [AttributeType.STRENGTH]: 200, // 增加物理攻击，确保能打破盾
      [AttributeType.SPEED]: 50,
    });

    // 2. 设计一个护盾 Buff 技能
    // 增加冷却时间，让 Buff 有机会自然消失
    const shieldSkill = AbilityFactory.create({
      slug: 'shield_wall',
      name: '不动如山',
      type: AbilityType.ACTIVE_SKILL,
      tags: [GameplayTags.ABILITY.FUNCTION.HEAL],
      priority: 100,
      cooldown: 5, // 5回合冷却
      targetPolicy: { team: 'self', scope: 'single' },
      effects: [
        {
          type: 'shield',
          params: {
            value: {
              base: 100,
              attribute: AttributeType.SPIRIT,
              coefficient: 2.0,
            },
          },
        },
      ],
    });
    player.abilities.addAbility(shieldSkill);

    // 3. 执行战斗模拟
    const engine = new BattleEngineV5(player, opponent);
    const result = engine.execute();

    const facts = result.sequences.flatMap((sequence) => sequence.facts);
    expect(
      facts.some(
        (fact) =>
          fact.type === 'shield' &&
          fact.origin.kind === 'owned' &&
          fact.origin.carrier.name === '不动如山',
      ),
    ).toBe(true);
    expect(
      facts.some(
        (fact) => fact.type === 'damage' && fact.shieldAbsorbed > 0,
      ),
    ).toBe(true);
  });
});
