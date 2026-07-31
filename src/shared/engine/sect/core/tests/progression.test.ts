import { describe, expect, it } from 'vitest';
import {
  getPathProgress,
  getSectMethodLevelCap,
  getSectMethodTrainingCost,
  StandardSectRules,
  standardSectProgression,
  validateMeridianLoadoutUpdate,
  validateMeridianNodeIds,
} from '..';
import { HEAVY_SWORD_PATH, SWIFT_SWORD_PATH } from '../../content/lingxiao';

describe('通用宗门成长', () => {
  it('每个境界阶段开放五级并在渡劫圆满达到180级', () => {
    expect(getSectMethodLevelCap('炼气', '初期')).toBe(5);
    expect(getSectMethodLevelCap('筑基', '初期')).toBe(25);
    expect(getSectMethodLevelCap('渡劫', '圆满')).toBe(180);
  });

  it.each([
    [1, 50, 200],
    [50, 550, 1_700],
    [100, 6_270, 18_900],
    [120, 16_620, 49_900],
    [150, 71_810, 215_500],
    [180, 310_360, 931_100],
  ])(
    '%i级按独立指数曲线计算单级修为与灵石',
    (level, cultivationExp, spiritStones) => {
      expect(getSectMethodTrainingCost(level - 1, level)).toEqual({
        cultivationExp,
        comprehensionInsight: 0,
        spiritStones,
      });
    },
  );

  it('逐级取整后累加跨级成本', () => {
    expect(getSectMethodTrainingCost(4, 6)).toEqual({
      cultivationExp: 140,
      comprehensionInsight: 0,
      spiritStones: 600,
    });
  });

  it('1至180级累计成本与分段累加一致', () => {
    const total = getSectMethodTrainingCost(0, 180);
    const first = getSectMethodTrainingCost(0, 120);
    const second = getSectMethodTrainingCost(120, 180);
    expect(total).toEqual({
      cultivationExp: 6_517_250,
      comprehensionInsight: 0,
      spiritStones: 19_560_400,
    });
    expect(total.cultivationExp).toBe(
      first.cultivationExp + second.cultivationExp,
    );
    expect(total.spiritStones).toBe(
      first.spiritStones + second.spiritStones,
    );
    expect(first.comprehensionInsight + second.comprehensionInsight).toBe(0);
  });

  it('所有可用等级的灵石成本均高于修为成本', () => {
    for (let level = 1; level <= 180; level += 1) {
      const cost = getSectMethodTrainingCost(level - 1, level);
      expect(cost.spiritStones).toBeGreaterThan(cost.cultivationExp);
      expect(cost.comprehensionInsight).toBe(0);
    }
  });

  it('参悟只允许选择已解锁层且同层互斥', () => {
    expect(() =>
      validateMeridianNodeIds({
        path: SWIFT_SWORD_PATH,
        nodeIds: ['swift-opening'],
        unlockedLayerIds: [],
        methods: {},
      }),
    ).toThrow('尚未解锁');
    expect(() =>
      validateMeridianNodeIds({
        path: SWIFT_SWORD_PATH,
        nodeIds: ['swift-opening', 'swift-hidden-edge'],
        unlockedLayerIds: ['1'],
        methods: {},
      }),
    ).toThrow('只能选择一个节点');
    expect(
      validateMeridianNodeIds({
        path: HEAVY_SWORD_PATH,
        nodeIds: ['heavy-opening'],
        unlockedLayerIds: ['1'],
        methods: {},
      }),
    ).toEqual(['heavy-opening']);
  });

  it('六层按顺序、境界和精确资源成本解锁', () => {
    expect(
      HEAVY_SWORD_PATH.layers.map((layer) => ({
        realm: `${layer.minRealm}${layer.minRealmStage}`,
        cost: layer.cost,
      })),
    ).toEqual([
      {
        realm: '筑基中期',
        cost: {
          cultivationExp: 5_000,
          comprehensionInsight: 100,
          spiritStones: 25_000,
        },
      },
      {
        realm: '金丹圆满',
        cost: {
          cultivationExp: 20_000,
          comprehensionInsight: 100,
          spiritStones: 100_000,
        },
      },
      {
        realm: '化神中期',
        cost: {
          cultivationExp: 80_000,
          comprehensionInsight: 100,
          spiritStones: 400_000,
        },
      },
      {
        realm: '炼虚圆满',
        cost: {
          cultivationExp: 320_000,
          comprehensionInsight: 100,
          spiritStones: 1_600_000,
        },
      },
      {
        realm: '大乘中期',
        cost: {
          cultivationExp: 1_280_000,
          comprehensionInsight: 100,
          spiritStones: 6_400_000,
        },
      },
      {
        realm: '渡劫圆满',
        cost: {
          cultivationExp: 5_120_000,
          comprehensionInsight: 100,
          spiritStones: 25_600_000,
        },
      },
    ]);
    const progress = getPathProgress({
      path: HEAVY_SWORD_PATH,
      unlockedLayerIds: ['1', '2', '3', '4'],
      realm: '大乘',
      stage: '中期',
    });
    expect(progress.unlockedLayers.map((layer) => layer.id)).toEqual([
      '1',
      '2',
      '3',
      '4',
    ]);
    expect(progress.nextLayer).toMatchObject({ id: '5' });
    expect(progress.nextLayerAvailable).toBe(true);
    expect(() =>
      standardSectProgression.assertPathLayerUnlock({
        path: HEAVY_SWORD_PATH,
        unlockedLayerIds: ['1'],
        layerId: '3',
        realm: '金丹',
        stage: '圆满',
        methods: {},
      }),
    ).toThrow('按顺序解锁');
  });

  it('六层在各自境界节点开放且不绑定心法', () => {
    const gates = [
      {
        layerId: '1',
        before: ['筑基', '初期'],
        reached: ['筑基', '中期'],
      },
      {
        layerId: '2',
        before: ['金丹', '后期'],
        reached: ['金丹', '圆满'],
      },
      {
        layerId: '3',
        before: ['化神', '初期'],
        reached: ['化神', '中期'],
      },
      {
        layerId: '4',
        before: ['炼虚', '后期'],
        reached: ['炼虚', '圆满'],
      },
      {
        layerId: '5',
        before: ['大乘', '初期'],
        reached: ['大乘', '中期'],
      },
      {
        layerId: 'ultimate',
        before: ['渡劫', '后期'],
        reached: ['渡劫', '圆满'],
      },
    ] as const;

    for (const [index, gate] of gates.entries()) {
      const unlockedLayerIds = HEAVY_SWORD_PATH.layers
        .slice(0, index)
        .map((layer) => layer.id);
      const before = getPathProgress({
        path: HEAVY_SWORD_PATH,
        unlockedLayerIds,
        realm: gate.before[0],
        stage: gate.before[1],
        methods: {},
      });
      const reached = getPathProgress({
        path: HEAVY_SWORD_PATH,
        unlockedLayerIds,
        realm: gate.reached[0],
        stage: gate.reached[1],
        methods: {},
      });
      expect(before.nextLayer?.id).toBe(gate.layerId);
      expect(before.nextLayerAvailable).toBe(false);
      expect(reached.nextLayer?.id).toBe(gate.layerId);
      expect(reached.nextLayerAvailable).toBe(true);
    }
  });

  it('流派指数成本累计正确且每层均消耗满额道心感悟', () => {
    const onePath = HEAVY_SWORD_PATH.layers.reduce(
      (total, layer) => ({
        cultivationExp: total.cultivationExp + layer.cost.cultivationExp,
        comprehensionInsight:
          total.comprehensionInsight + layer.cost.comprehensionInsight,
        spiritStones: total.spiritStones + layer.cost.spiritStones,
      }),
      { cultivationExp: 0, comprehensionInsight: 0, spiritStones: 0 },
    );
    expect(onePath).toEqual({
      cultivationExp: 6_825_000,
      comprehensionInsight: 600,
      spiritStones: 34_125_000,
    });
    expect({
      cultivationExp: onePath.cultivationExp * 2,
      comprehensionInsight: onePath.comprehensionInsight * 2,
      spiritStones: onePath.spiritStones * 2,
    }).toEqual({
      cultivationExp: 13_650_000,
      comprehensionInsight: 1_200,
      spiritStones: 68_250_000,
    });
    for (const layer of HEAVY_SWORD_PATH.layers) {
      expect(layer.cost.comprehensionInsight).toBe(100);
      expect(layer.cost.spiritStones).toBeGreaterThan(
        layer.cost.cultivationExp,
      );
    }
  });

  it('当前只开放方案一并保留三槽底层容量', () => {
    expect(StandardSectRules.meridianLoadoutSlots).toEqual([1, 2, 3]);
    expect(StandardSectRules.enabledMeridianLoadoutSlots).toEqual([1]);
  });

  it('已保存节点不可移除或替换，但可为新层级追加选择', () => {
    const base = {
      path: HEAVY_SWORD_PATH,
      currentNodeIds: ['heavy-opening'],
      unlockedLayerIds: ['1', '2'],
      methods: {},
    };
    expect(
      validateMeridianLoadoutUpdate({
        ...base,
        nodeIds: ['heavy-opening', 'heavy-triple-ridge'],
      }),
    ).toEqual(['heavy-opening', 'heavy-triple-ridge']);
    expect(() =>
      validateMeridianLoadoutUpdate({
        ...base,
        nodeIds: [],
      }),
    ).toThrow('重置功能尚未开放');
    expect(() =>
      validateMeridianLoadoutUpdate({
        ...base,
        nodeIds: ['heavy-hidden-weight'],
      }),
    ).toThrow('重置功能尚未开放');
  });
});
