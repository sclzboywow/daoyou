import { GameplayTags } from '@shared/engine/shared/tag-domain';
import { buildConditionBattleUnitInitFragment } from '@shared/lib/conditionBattle';
import { simulateBattleV5 } from '@shared/lib/battle/simulateBattleV5';
import type { CultivatorCondition, ConditionStatusKey } from '@shared/types/condition';
import type { Cultivator } from '@shared/types/cultivator';
import { AbilityType, AttributeType, ModifierType } from '../../core/types';
import { createCombatUnitFromCultivator } from '../../adapters/CultivatorCombatAdapter';
import {
  prepareBattleContext,
  prepareStandardFullBattle,
  projectBattleEntryState,
} from '../../setup/BattleStateStrategy';
import { Unit } from '../../units/Unit';

const NOW = new Date('2026-07-30T08:00:00.000Z');

function createCondition(
  statuses: ConditionStatusKey[] = [],
): CultivatorCondition {
  return {
    version: 1,
    resources: {
      hp: { current: 320, max: 600 },
      mp: { current: 180, max: 400 },
    },
    gauges: { pillToxicity: 0 },
    tracks: {
      bodyCultivation: {
        version: 1,
        realm: 'mortal_body',
        tracks: {
          skin: { level: 0, progress: 0 },
          sinew_bone: { level: 0, progress: 0 },
          organs: { level: 0, progress: 0 },
          qi_blood: { level: 10, progress: 0 },
          primordial_spirit: { level: 5, progress: 0 },
        },
        milestones: {},
      },
      tempering: {
        vitality: { level: 0, progress: 0 },
        spirit: { level: 0, progress: 0 },
        wisdom: { level: 0, progress: 0 },
        speed: { level: 0, progress: 0 },
        willpower: { level: 0, progress: 0 },
      },
      marrowWash: { level: 0, progress: 0 },
    },
    counters: {
      longTermPillUsesByRealm: {},
      cultivationPillUsesByRealm: {},
      longevityPillUsesByRealm: {},
    },
    statuses: statuses.map((key) => ({
      key,
      stacks: key === 'weakness' ? 2 : 1,
      source: 'battle',
      duration: { kind: 'until_removed' },
      createdAt: NOW.toISOString(),
      updatedAt: NOW.toISOString(),
    })),
    timestamps: {
      lastRecoveryAt: NOW.toISOString(),
    },
  };
}

function createCultivator(
  id: string,
  options: { enhanced?: boolean; statuses?: ConditionStatusKey[] } = {},
): Cultivator {
  const enhanced = options.enhanced ?? false;
  const condition = createCondition(options.statuses);
  return {
    id,
    name: id,
    age: 18,
    lifespan: 120,
    attributes: {
      vitality: 10,
      spirit: 10,
      wisdom: 10,
      speed: 10,
      willpower: 10,
    },
    spiritual_roots: [],
    pre_heaven_fates: [],
    cultivations: enhanced
      ? [
          {
            id: 'max-resource-gongfa',
            name: '周天养元诀',
            attributeModifiers: [
              {
                attrType: AttributeType.MAX_HP,
                type: ModifierType.FIXED,
                value: 120,
              },
            ],
            abilityConfig: {
              slug: 'max-resource-gongfa',
              name: '周天养元诀',
              type: AbilityType.PASSIVE_SKILL,
              tags: [GameplayTags.ABILITY.KIND.GONGFA],
              modifiers: [
                {
                  attrType: AttributeType.MAX_HP,
                  type: ModifierType.FIXED,
                  value: 120,
                },
              ],
            },
          },
        ]
      : [],
    skills: [],
    inventory: {
      artifacts: enhanced
        ? [
            {
              id: 'max-resource-artifact',
              name: '归元佩',
              slot: 'accessory',
              element: '水',
              attributeModifiers: [
                {
                  attrType: AttributeType.MAX_MP,
                  type: ModifierType.FIXED,
                  value: 90,
                },
              ],
              abilityConfig: {
                slug: 'max-resource-artifact',
                name: '归元佩',
                type: AbilityType.PASSIVE_SKILL,
                tags: [GameplayTags.ABILITY.KIND.ARTIFACT],
                modifiers: [
                  {
                    attrType: AttributeType.MAX_MP,
                    type: ModifierType.FIXED,
                    value: 90,
                  },
                ],
              },
            },
          ]
        : [],
      consumables: [],
      materials: [],
    },
    equipped: {
      weapon: null,
      armor: null,
      accessory: enhanced ? 'max-resource-artifact' : null,
    },
    sect: enhanced
      ? {
          membershipId: `${id}-sect`,
          sectId: 'tianyan',
          status: 'active',
          contribution: 0,
          configVersion: 1,
          methods: {
            'tianyan-canon': 100,
            'wood-vitality': 100,
            'fire-illumination': 0,
            'earth-bearing': 0,
            'metal-severing': 0,
            'water-flowing': 100,
          },
          paths: [],
          abilityLoadout: [null, null, null, null],
        }
      : undefined,
    condition,
    spirit_stones: 0,
    gender: '男',
    realm: '炼气',
    realm_stage: '初期',
  };
}

describe('BattleStateStrategy', () => {
  test('角色全部常驻修正组装后，以最终上限初始化满资源', () => {
    const baseline = createCombatUnitFromCultivator(
      createCultivator('baseline'),
    );
    const enhanced = createCombatUnitFromCultivator(
      createCultivator('enhanced', { enhanced: true }),
    );

    expect(enhanced.getMaxHp()).toBeGreaterThan(baseline.getMaxHp());
    expect(enhanced.getMaxMp()).toBeGreaterThan(baseline.getMaxMp());
    expect(enhanced.getCurrentHp()).toBe(enhanced.getMaxHp());
    expect(enhanced.getCurrentMp()).toBe(enhanced.getMaxMp());
  });

  test('四类策略按声明的资源来源解析双方入场状态', () => {
    const player = createCultivator('player', { enhanced: true });
    const opponent = createCultivator('opponent', { enhanced: true });
    const standard = prepareStandardFullBattle({ player, opponent });
    const persistent = prepareBattleContext({
      strategyId: 'persistent_world',
      player,
      opponent,
      playerState: {
        resources: { kind: 'absolute', hp: 240, mp: 130 },
      },
      opponentState: { resources: { kind: 'full' } },
    });
    const isolated = prepareBattleContext({
      strategyId: 'isolated_run',
      player,
      opponent,
      playerState: {
        resources: { kind: 'absolute', hp: 180, mp: 90 },
        fragment: {
          modifiers: [
            {
              attrType: AttributeType.MAX_MP,
              type: ModifierType.MULTIPLY,
              value: 1.5,
            },
          ],
        },
      },
      opponentState: { resources: { kind: 'full' } },
    });
    const training = prepareStandardFullBattle({
      strategyId: 'training_custom',
      player,
      opponent,
      opponentFragment: {
        modifiers: [
          {
            attrType: AttributeType.MAX_HP,
            type: ModifierType.OVERRIDE,
            value: 100_000,
          },
        ],
      },
    });

    expect(standard.entryState.player.hp.current).toBe(
      standard.entryState.player.hp.max,
    );
    expect(standard.entryState.opponent.mp.current).toBe(
      standard.entryState.opponent.mp.max,
    );
    expect(persistent.entryState.player.hp.current).toBe(240);
    expect(persistent.entryState.player.mp.current).toBe(130);
    expect(persistent.entryState.opponent.hp.current).toBe(
      persistent.entryState.opponent.hp.max,
    );
    expect(isolated.entryState.player.hp.current).toBe(180);
    expect(isolated.entryState.player.mp.current).toBe(90);
    expect(isolated.entryState.player.mp.max).toBeGreaterThan(
      persistent.entryState.player.mp.max,
    );
    expect(training.entryState.opponent.hp).toEqual({
      current: 100_000,
      max: 100_000,
      percent: 100,
    });
  });

  test('伤势三档、虚弱与资源钳制统一作用于最终入场投影', () => {
    const opponent = createCultivator('opponent');
    const basePlayer = createCultivator('base-player');
    const base = prepareBattleContext({
      strategyId: 'persistent_world',
      player: basePlayer,
      opponent,
      playerState: {
        resources: { kind: 'absolute', hp: 999_999, mp: 999_999 },
        fragment: buildConditionBattleUnitInitFragment(
          basePlayer.condition!,
          NOW,
        ),
      },
      opponentState: { resources: { kind: 'full' } },
    }).entryState.player;

    const woundMaxima = (
      ['minor_wound', 'major_wound', 'near_death'] as const
    ).map((status) => {
      const player = createCultivator(status, { statuses: [status] });
      return prepareBattleContext({
        strategyId: 'persistent_world',
        player,
        opponent,
        playerState: {
          resources: { kind: 'absolute', hp: 999_999, mp: 999_999 },
          fragment: buildConditionBattleUnitInitFragment(
            player.condition!,
            NOW,
          ),
        },
        opponentState: { resources: { kind: 'full' } },
      }).entryState.player;
    });
    const weakPlayer = createCultivator('weak', { statuses: ['weakness'] });
    const weakness = prepareBattleContext({
      strategyId: 'persistent_world',
      player: weakPlayer,
      opponent,
      playerState: {
        resources: { kind: 'absolute', hp: 999_999, mp: 999_999 },
        fragment: buildConditionBattleUnitInitFragment(
          weakPlayer.condition!,
          NOW,
        ),
      },
      opponentState: { resources: { kind: 'full' } },
    }).entryState.player;

    expect(woundMaxima.map((entry) => entry.hp.max)).toEqual(
      [...woundMaxima.map((entry) => entry.hp.max)].sort((a, b) => b - a),
    );
    for (const entry of woundMaxima) {
      expect(entry.hp.current).toBe(entry.hp.max);
      expect(entry.hp.max).toBeLessThan(base.hp.max);
    }
    expect(weakness.hp.max).toBeLessThan(base.hp.max);
    expect(weakness.mp.max).toBeLessThan(base.mp.max);
    expect(weakness.hp.current).toBe(weakness.hp.max);
    expect(weakness.mp.current).toBe(weakness.mp.max);
  });

  test('战前投影与 battle_init 首帧逐字段一致', () => {
    const player = createCultivator('player', {
      enhanced: true,
      statuses: ['major_wound', 'weakness'],
    });
    const opponent = createCultivator('opponent', { enhanced: true });
    const context = prepareBattleContext({
      strategyId: 'persistent_world',
      player,
      opponent,
      playerState: {
        resources: { kind: 'absolute', hp: 400, mp: 160 },
        fragment: buildConditionBattleUnitInitFragment(
          player.condition!,
          NOW,
        ),
      },
      opponentState: {
        resources: { kind: 'full' },
        fragment: {
          modifiers: [
            {
              attrType: AttributeType.MAX_HP,
              type: ModifierType.MULTIPLY,
              value: 1.2,
            },
          ],
        },
      },
      conditionBaseline: player.condition,
    });
    const separatelyProjected = projectBattleEntryState({
      player,
      opponent,
      initConfig: context.initConfig,
    });
    const result = simulateBattleV5(context);
    const initFrame = result.stateTimeline.frames.find(
      (frame) => frame.phase === 'battle_init',
    )!;

    expect(separatelyProjected).toEqual(context.entryState);
    for (const [id, entry] of [
      [player.id!, context.entryState.player],
      [opponent.id!, context.entryState.opponent],
    ] as const) {
      expect(initFrame.units[id].hp).toEqual(entry.hp);
      expect(initFrame.units[id].mp).toEqual(entry.mp);
      expect(initFrame.units[id].shield).toBe(entry.shield);
    }
  });

  test('战斗中提高资源上限不会产生隐式治疗', () => {
    const unit = new Unit('unit', '测试单位', {
      [AttributeType.VITALITY]: 10,
      [AttributeType.SPIRIT]: 10,
    });
    unit.setHp(100);
    unit.setMp(80);
    const before = {
      hp: unit.getCurrentHp(),
      mp: unit.getCurrentMp(),
      maxHp: unit.getMaxHp(),
      maxMp: unit.getMaxMp(),
    };
    unit.attributes.addModifier({
      id: 'runtime-max-up',
      attrType: AttributeType.VITALITY,
      type: ModifierType.FIXED,
      value: 20,
      source: {
        sourceType: 'battle_init',
        sourceKey: 'runtime-test',
      },
    });
    unit.attributes.addModifier({
      id: 'runtime-mp-up',
      attrType: AttributeType.SPIRIT,
      type: ModifierType.FIXED,
      value: 20,
      source: {
        sourceType: 'battle_init',
        sourceKey: 'runtime-test',
      },
    });
    unit.updateDerivedStats();

    expect(unit.getMaxHp()).toBeGreaterThan(before.maxHp);
    expect(unit.getMaxMp()).toBeGreaterThan(before.maxMp);
    expect(unit.getCurrentHp()).toBe(before.hp);
    expect(unit.getCurrentMp()).toBe(before.mp);
  });

  test('缺失策略、错误资源来源、无效数值与伪造上下文立即失败', () => {
    const player = createCultivator('player');
    const opponent = createCultivator('opponent');

    expect(() =>
      prepareBattleContext({
        strategyId: undefined,
        player,
        opponent,
        playerState: { resources: { kind: 'full' } },
        opponentState: { resources: { kind: 'full' } },
      } as never),
    ).toThrow('战斗状态策略未声明或无效');
    expect(() =>
      prepareBattleContext({
        strategyId: 'persistent_world',
        player,
        opponent,
        playerState: { resources: { kind: 'full' } },
        opponentState: { resources: { kind: 'full' } },
      } as never),
    ).toThrow('要求玩家资源来源为 absolute');
    expect(() =>
      prepareBattleContext({
        strategyId: 'isolated_run',
        player,
        opponent,
        playerState: {
          resources: { kind: 'absolute', hp: Number.NaN, mp: 10 },
        },
        opponentState: { resources: { kind: 'full' } },
      }),
    ).toThrow('战斗初始资源必须为有限数值');
    expect(() =>
      simulateBattleV5({
        strategyId: 'standard_full',
        player,
        opponent,
        initConfig: {},
        entryState: {},
      } as never),
    ).toThrow('已解析上下文');

    const prepared = prepareStandardFullBattle({ player, opponent });
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.player)).toBe(true);
    expect(Object.isFrozen(prepared.entryState.player.hp)).toBe(true);
    expect(Object.isFrozen(prepared.initConfig.player.resourceState)).toBe(
      true,
    );
  });
});
