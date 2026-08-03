import {
  AttributeType,
  ModifierType,
} from '@shared/engine/battle-v5/core/types';
import { describe, expect, it } from 'vitest';
import { projectSectMethodModifiers, type CultivatorSectState } from '..';
import { LINGXIAO_SECT } from '../../content/lingxiao';
import { TIANYAN_SECT } from '../../content/tianyan';
import { WUXIANG_SECT } from '../../content/wuxiang';
import { YOUDU_SECT } from '../../content/youdu';

const state: CultivatorSectState = {
  membershipId: 'm1',
  sectId: 'lingxiao',
  status: 'active',
  contribution: 0,
  configVersion: 4,
  methods: { 'sword-guidance': 100, 'sword-nurturing': 100 },
  paths: [],
  abilityLoadout: [null, null, null, null],
};

describe('宗门心法属性投影', () => {
  it('四宗24本心法锁定稳定ID、曲线、属性类型和满级上限', () => {
    const actual = [LINGXIAO_SECT, TIANYAN_SECT, YOUDU_SECT, WUXIANG_SECT]
      .flatMap((sect) =>
        [...sect.methods]
          .sort((left, right) => left.slot - right.slot)
          .map((method) => {
            const panel = method.growthProfile.panelModifier;
            return [
              method.id,
              method.growthProfile.curve,
              panel?.attrType ?? null,
              panel?.type ?? null,
              panel?.maxValue ?? null,
            ];
          }),
      );

    expect(actual).toEqual([
      ['lingxiao-canon', 'balanced', null, null, null],
      ['edge-cleansing', 'early', AttributeType.ACCURACY, ModifierType.FIXED, 0.06],
      ['sword-guidance', 'balanced', AttributeType.ATK, ModifierType.ADD, 0.22],
      ['void-step', 'early', AttributeType.EVASION_RATE, ModifierType.FIXED, 0.05],
      ['origin-returning', 'early', AttributeType.MAGIC_DEF, ModifierType.ADD, 0.1],
      ['sword-nurturing', 'late', AttributeType.DEF, ModifierType.ADD, 0.14],
      ['tianyan-canon', 'balanced', null, null, null],
      ['wood-vitality', 'early', AttributeType.MAX_HP, ModifierType.ADD, 0.12],
      ['fire-illumination', 'balanced', AttributeType.MAGIC_ATK, ModifierType.ADD, 0.18],
      ['earth-bearing', 'early', AttributeType.MAGIC_DEF, ModifierType.ADD, 0.14],
      ['metal-severing', 'late', AttributeType.MAGIC_PENETRATION, ModifierType.FIXED, 0.08],
      ['water-flowing', 'balanced', AttributeType.MAX_MP, ModifierType.ADD, 0.18],
      ['youdu-canon', 'late', null, null, null],
      ['three-souls-separation', 'balanced', AttributeType.MAGIC_ATK, ModifierType.ADD, 0.15],
      ['forgetful-river-record', 'late', AttributeType.MAX_MP, ModifierType.ADD, 0.18],
      ['seven-souls-seizure', 'late', AttributeType.CONTROL_HIT, ModifierType.FIXED, 0.08],
      ['soul-pinning-ironbook', 'balanced', AttributeType.MAGIC_DEF, ModifierType.ADD, 0.12],
      ['dead-heart-living-spirit', 'early', AttributeType.CONTROL_RESISTANCE, ModifierType.FIXED, 0.08],
      ['wuxiang-canon', 'balanced', null, null, null],
      ['blood-lotus', 'balanced', AttributeType.MAX_HP, ModifierType.ADD, 0.2],
      ['white-bone', 'early', AttributeType.DEF, ModifierType.ADD, 0.16],
      ['wrathful-ming', 'late', AttributeType.ATK, ModifierType.ADD, 0.14],
      ['six-senses', 'early', AttributeType.CONTROL_RESISTANCE, ModifierType.FIXED, 0.1],
      ['reed-crossing-method', 'balanced', AttributeType.MAGIC_DEF, ModifierType.ADD, 0.12],
    ]);
  });

  it('由共享曲线统一投影战斗与展示属性', () => {
    const projection = projectSectMethodModifiers(state, LINGXIAO_SECT);
    expect(projection.map((entry) => entry.methodId)).toEqual([
      'sword-guidance',
      'sword-nurturing',
    ]);
    expect(projection[0].modifiers[0].value).toBe(0.0951);
    expect(projection[1].modifiers[0].value).toBe(0.0501);
  });

  it.each([
    [45, 0.008],
    [180, 0.08],
  ])('天衍太白心法%i级提供精确法术穿透', (level, expected) => {
    const projection = projectSectMethodModifiers(
      {
        ...state,
        sectId: 'tianyan',
        configVersion: 1,
        methods: { 'metal-severing': level },
      },
      TIANYAN_SECT,
    );
    expect(projection[0].modifiers[0].value).toBe(expected);
  });
});
