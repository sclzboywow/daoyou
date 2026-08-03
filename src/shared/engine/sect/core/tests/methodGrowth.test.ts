import { StackRule } from '@shared/engine/battle-v5/buffs/Buff';
import {
  AttributeType,
  BuffType,
  DamageType,
  ModifierType,
} from '@shared/engine/battle-v5/core/types';
import { describe, expect, it } from 'vitest';
import {
  resolveSectMethodCurve,
  StandardSectMethodGrowthPolicy,
  withSectBuffMethodGrowth,
  type SectCompiledAbility,
  type SectHeartMethodDefinition,
} from '..';

const methods: SectHeartMethodDefinition[] = [
  {
    id: 'fixture-method',
    slot: 1,
    name: '成长心法',
    description: '测试',
    growthProfile: {
      curve: 'balanced',
      effects: { damage: 0.17, heal: 0.12, shield: 0.17, status: 0.12 },
      durationMilestones: [
        { level: 60, bonus: 1 },
        { level: 120, bonus: 2 },
      ],
      countMilestones: [
        { level: 60, bonus: 1 },
        { level: 120, bonus: 2 },
        { level: 180, bonus: 3 },
      ],
    },
  },
  {
    id: 'cross-method',
    slot: 2,
    name: '跨心法',
    description: '测试',
    growthProfile: {
      curve: 'late',
      effects: { damage: 0.12, heal: 0.1, shield: 0.1, status: 0.25 },
      durationMilestones: [
        { level: 60, bonus: 1 },
        { level: 120, bonus: 2 },
      ],
    },
  },
];

const policy = new StandardSectMethodGrowthPolicy(methods);

function ability(): SectCompiledAbility {
  return {
    config: {
      slug: 'sect.fixture.growth',
      name: '成长测试',
      type: 'active_skill',
      cooldown: 3,
      effects: [
        {
          type: 'damage',
          params: {
            value: { attribute: AttributeType.ATK, coefficient: 1 },
            damageType: DamageType.PHYSICAL,
          },
        },
        {
          type: 'heal',
          params: { value: { targetMaxHpRatio: 0.1 }, target: 'hp' },
        },
        {
          type: 'shield',
          params: { value: { attribute: AttributeType.ATK, coefficient: 0.5 } },
        },
        {
          type: 'apply_buff',
          params: {
            buffConfig: withSectBuffMethodGrowth(
              {
                id: 'fixture.growing-buff',
                name: '成长状态',
                type: BuffType.BUFF,
                duration: 3,
                stackRule: StackRule.REFRESH_DURATION,
                modifiers: [
                  {
                    attrType: AttributeType.ATK,
                    type: ModifierType.ADD,
                    value: 0.1,
                  },
                ],
              },
              { duration: true },
            ),
          },
        },
        {
          type: 'delayed_effect',
          params: {
            delayTurns: 1,
            effects: [
              {
                type: 'damage',
                params: {
                  value: { attribute: AttributeType.ATK, coefficient: 0.4 },
                  damageType: DamageType.PHYSICAL,
                },
              },
            ],
          },
        },
        {
          type: 'combat_resource_modify',
          params: { resourceId: 'fixture', operation: 'add', amount: 2 },
        },
      ],
    },
    detailRows: [],
    notes: [],
  };
}

describe('心法连续成长曲线', () => {
  it.each([
    ['early', 0, 0],
    ['early', 1, 0.0045],
    ['early', 45, 0.2125],
    ['early', 90, 0.45],
    ['early', 135, 0.7125],
    ['early', 180, 1],
    ['balanced', 0, 0],
    ['balanced', 1, 0.0028],
    ['balanced', 45, 0.1563],
    ['balanced', 90, 0.375],
    ['balanced', 135, 0.6563],
    ['balanced', 180, 1],
    ['late', 0, 0],
    ['late', 1, 0.0011],
    ['late', 45, 0.1],
    ['late', 90, 0.3],
    ['late', 135, 0.6],
    ['late', 180, 1],
  ] as const)('%s曲线在%i级为%i', (curve, level, expected) => {
    expect(resolveSectMethodCurve(curve, level)).toBe(expected);
  });

  it('钳制非法等级并保持单调与满级封顶', () => {
    for (const curve of ['early', 'balanced', 'late'] as const) {
      expect(resolveSectMethodCurve(curve, -10)).toBe(0);
      expect(resolveSectMethodCurve(curve, Number.NaN)).toBe(0);
      expect(resolveSectMethodCurve(curve, 999)).toBe(1);
      const values = Array.from({ length: 181 }, (_, level) =>
        resolveSectMethodCurve(curve, level),
      );
      expect(values.every((value, index) => index === 0 || value >= values[index - 1])).toBe(true);
    }
  });
});

describe('StandardSectMethodGrowthPolicy', () => {
  it('按分类缩放伤害、治疗、护盾、状态，嵌套效果只缩放一次', () => {
    const projected = policy.projectAbility(ability(), 'fixture-method', {
      'fixture-method': 180,
    });
    expect(projected.config.effects?.[0]).toMatchObject({
      params: { value: { coefficient: 1.17 } },
    });
    expect(projected.config.effects?.[1]).toMatchObject({
      params: { value: { targetMaxHpRatio: 0.112 } },
    });
    expect(projected.config.effects?.[2]).toMatchObject({
      params: { value: { coefficient: 0.585 } },
    });
    expect(projected.config.effects?.[3]).toMatchObject({
      params: { buffConfig: { duration: 5, modifiers: [{ value: 0.112 }] } },
    });
    expect(projected.config.effects?.[4]).toMatchObject({
      params: { effects: [{ params: { value: { coefficient: 0.468 } } }] },
    });
    expect(projected.config.effects?.[5]).toMatchObject({
      params: { amount: 2 },
    });
    expect(projected.config.cooldown).toBe(3);
    expect(JSON.stringify(projected.config)).not.toContain('__sectMethodGrowth');
  });

  it('无来源神通保持中性，但显式跨心法状态仍按指定心法成长', () => {
    const source = ability();
    source.config.effects = [
      source.config.effects![0],
      {
        type: 'apply_buff',
        params: {
          buffConfig: withSectBuffMethodGrowth(
            {
              id: 'fixture.cross-buff',
              name: '跨心法状态',
              type: BuffType.DEBUFF,
              duration: 3,
              stackRule: StackRule.REFRESH_DURATION,
              modifiers: [
                {
                  attrType: AttributeType.DEF,
                  type: ModifierType.ADD,
                  value: -0.1,
                },
              ],
            },
            { methodId: 'cross-method', duration: true },
          ),
        },
      },
    ];
    const projected = policy.projectAbilityWithoutMethod(source, {
      'cross-method': 180,
    });
    expect(projected.config.effects?.[0]).toMatchObject({
      params: { value: { coefficient: 1 } },
    });
    expect(projected.config.effects?.[1]).toMatchObject({
      params: { buffConfig: { duration: 5, modifiers: [{ value: -0.125 }] } },
    });
  });

  it.each([
    [59, 1, 3],
    [60, 2, 4],
    [120, 3, 5],
    [180, 4, 5],
  ])('等级%i使用离散计数和持续时间里程碑', (level, count, duration) => {
    expect(policy.growCount('fixture-method', 1, level)).toBe(count);
    expect(policy.growDuration('fixture-method', 3, level)).toBe(duration);
  });
});
