import {
  AttributeType,
  ModifierType,
} from '@shared/engine/battle-v5/core/types';
import { describe, expect, it } from 'vitest';
import {
  projectSectMethodGrowthPresentation,
  type SectHeartMethodDefinition,
} from '..';

const panelMethod: SectHeartMethodDefinition = {
  id: 'panel-method',
  slot: 1,
  name: '面板成长心法',
  description: '测试当前、下一级与满级投影。',
  growthProfile: {
    curve: 'balanced',
    panelModifier: {
      attrType: AttributeType.ATK,
      type: ModifierType.ADD,
      maxValue: 0.22,
    },
    effects: { damage: 0.17, heal: 0.12, shield: 0.17, status: 0.12 },
  },
};

const primaryMethod: SectHeartMethodDefinition = {
  id: 'primary-method',
  slot: 1,
  name: '主心法',
  description: '测试无面板属性时的神通成长。',
  isPrimary: true,
  growthProfile: {
    curve: 'balanced',
    effects: { damage: 0.17, heal: 0.12, shield: 0.17, status: 0.12 },
  },
};

describe('心法成长展示投影', () => {
  it('统一生成当前、下一级、增量和满级收益', () => {
    const projection = projectSectMethodGrowthPresentation(panelMethod, 100);

    expect(projection).toMatchObject({
      curve: 'balanced',
      isMaxLevel: false,
      current: {
        level: 100,
        panelValue: 0.0951,
        effects: {
          damage: 0.0735,
          heal: 0.0519,
          shield: 0.0735,
          status: 0.0519,
        },
      },
      maximum: {
        level: 180,
        panelValue: 0.22,
        effects: { damage: 0.17, heal: 0.12, shield: 0.17, status: 0.12 },
      },
    });
    expect(projection.next?.snapshot.level).toBe(101);
    expect(projection.next?.delta.panelValue).toBeGreaterThan(0);
    expect(projection.next?.delta.effects.damage).toBeGreaterThan(0);
  });

  it('主心法没有面板值但仍提供神通成长', () => {
    const projection = projectSectMethodGrowthPresentation(primaryMethod, 90);

    expect(projection.current.panelValue).toBeUndefined();
    expect(projection.current.effects.damage).toBe(0.0638);
    expect(projection.next?.delta.panelValue).toBeUndefined();
  });

  it('180级不再生成下一级投影', () => {
    const projection = projectSectMethodGrowthPresentation(panelMethod, 180);

    expect(projection.isMaxLevel).toBe(true);
    expect(projection.current).toEqual(projection.maximum);
    expect(projection.next).toBeNull();
  });
});
