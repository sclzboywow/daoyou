import type { CultivatorCondition } from '@shared/types/condition';
import type {
  CultivatorCombatInput,
} from '../adapters/CultivatorCombatAdapter';
import { createBattleUnitsWithInit } from './BattleInitApplier';
import type {
  BattleStateStrategyId,
  BattleUnitInitFragment,
  ResolvedBattleInitConfigV5,
  ResourcePointState,
} from './types';

export type BattleResourceSource =
  | { kind: 'full' }
  | { kind: 'absolute'; hp: number; mp: number };

export interface BattleUnitStateStrategy {
  resources: BattleResourceSource;
  fragment?: BattleUnitInitFragment;
}

export interface BattleEntryResourceView {
  current: number;
  max: number;
  percent: number;
}

export interface BattleEntryUnitState {
  hp: BattleEntryResourceView;
  mp: BattleEntryResourceView;
  shield: number;
}

export interface BattleEntryState {
  player: BattleEntryUnitState;
  opponent: BattleEntryUnitState;
}

export interface PreparedBattleContext {
  readonly strategyId: BattleStateStrategyId;
  readonly player: CultivatorCombatInput;
  readonly opponent: CultivatorCombatInput;
  readonly initConfig: ResolvedBattleInitConfigV5;
  readonly entryState: BattleEntryState;
  readonly conditionBaseline?: CultivatorCondition;
}

type FullBattleUnitStateStrategy = BattleUnitStateStrategy & {
  resources: Extract<BattleResourceSource, { kind: 'full' }>;
};

type AbsoluteBattleUnitStateStrategy = BattleUnitStateStrategy & {
  resources: Extract<BattleResourceSource, { kind: 'absolute' }>;
};

interface PrepareBattleContextBase {
  player: CultivatorCombatInput;
  opponent: CultivatorCombatInput;
  conditionBaseline?: CultivatorCondition;
}

export type PrepareBattleContextOptions =
  | (PrepareBattleContextBase & {
      strategyId: 'standard_full' | 'training_custom';
      playerState: FullBattleUnitStateStrategy;
      opponentState: FullBattleUnitStateStrategy;
    })
  | (PrepareBattleContextBase & {
      strategyId: 'persistent_world' | 'isolated_run';
      playerState: AbsoluteBattleUnitStateStrategy;
      opponentState: FullBattleUnitStateStrategy;
    });

const PREPARED_CONTEXTS = new WeakSet<object>();
const BATTLE_STATE_STRATEGIES = new Set<BattleStateStrategyId>([
  'standard_full',
  'persistent_world',
  'isolated_run',
  'training_custom',
]);

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return Object.freeze(value);
}

export function mergeBattleUnitInitFragments(
  ...fragments: Array<BattleUnitInitFragment | null | undefined>
): BattleUnitInitFragment | undefined {
  const present = fragments.filter(
    (fragment): fragment is BattleUnitInitFragment => fragment !== undefined && fragment !== null,
  );
  if (present.length === 0) return undefined;

  return present.reduce<BattleUnitInitFragment>(
    (merged, fragment) => ({
      baseAttributeOverrides: {
        ...merged.baseAttributeOverrides,
        ...fragment.baseAttributeOverrides,
      },
      modifiers: [
        ...(merged.modifiers ?? []),
        ...(fragment.modifiers ?? []),
      ],
      resourceState: {
        ...merged.resourceState,
        ...fragment.resourceState,
      },
      statusRefs: [
        ...(merged.statusRefs ?? []),
        ...(fragment.statusRefs ?? []),
      ],
      startingBuffs: [
        ...(merged.startingBuffs ?? []),
        ...(fragment.startingBuffs ?? []),
      ],
    }),
    {},
  );
}

function normalizeAbsolute(value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error('战斗初始资源必须为有限数值');
  }
  return Math.max(0, Math.floor(value));
}

function assertStrategyResources(
  strategyId: BattleStateStrategyId,
  playerState: BattleUnitStateStrategy,
  opponentState: BattleUnitStateStrategy,
) {
  const expectsPersistentPlayer =
    strategyId === 'persistent_world' || strategyId === 'isolated_run';
  const expectedPlayerKind = expectsPersistentPlayer ? 'absolute' : 'full';

  if (playerState.resources.kind !== expectedPlayerKind) {
    throw new Error(
      `战斗策略 ${strategyId} 要求玩家资源来源为 ${expectedPlayerKind}`,
    );
  }
  if (opponentState.resources.kind !== 'full') {
    throw new Error(`战斗策略 ${strategyId} 要求敌方以最终满资源入场`);
  }
}

function resolveResourcePoint(
  source: BattleResourceSource,
  resource: 'hp' | 'mp',
): ResourcePointState {
  if (source.kind === 'full') {
    return { mode: 'percent', value: 1 };
  }
  return {
    mode: 'absolute',
    value: normalizeAbsolute(source[resource]),
  };
}

function resolveUnitInit(
  state: BattleUnitStateStrategy,
) {
  const fragment = state.fragment;
  return {
    ...fragment,
    resourceState: {
      ...fragment?.resourceState,
      hp: resolveResourcePoint(state.resources, 'hp'),
      mp: resolveResourcePoint(state.resources, 'mp'),
    },
  };
}

export function projectBattleUnitEntryState(args: {
  cultivator: CultivatorCombatInput;
  state: BattleUnitStateStrategy;
}): BattleEntryUnitState {
  const counterpart: CultivatorCombatInput = {
    ...args.cultivator,
    id: `${args.cultivator.id ?? args.cultivator.name}:entry-counterpart`,
    name: '入场投影',
  };
  const initConfig: ResolvedBattleInitConfigV5 = {
    player: resolveUnitInit(args.state),
    opponent: resolveUnitInit({ resources: { kind: 'full' } }),
  };
  return projectBattleEntryState({
    player: args.cultivator,
    opponent: counterpart,
    initConfig,
  }).player;
}

function resourceView(current: number, max: number): BattleEntryResourceView {
  return {
    current: Math.round(current),
    max,
    percent:
      max > 0 ? Math.round((current / max) * 10_000) / 100 : 0,
  };
}

export function projectBattleEntryState(args: {
  player: CultivatorCombatInput;
  opponent: CultivatorCombatInput;
  initConfig: ResolvedBattleInitConfigV5;
}): BattleEntryState {
  const { playerUnit, opponentUnit } = createBattleUnitsWithInit(
    args.player,
    args.opponent,
    args.initConfig,
  );
  const snapshot = (unit: typeof playerUnit): BattleEntryUnitState => ({
    hp: resourceView(unit.getCurrentHp(), unit.getMaxHp()),
    mp: resourceView(unit.getCurrentMp(), unit.getMaxMp()),
    shield: unit.getCurrentShield(),
  });
  try {
    return {
      player: snapshot(playerUnit),
      opponent: snapshot(opponentUnit),
    };
  } finally {
    playerUnit.buffs.clear();
    opponentUnit.buffs.clear();
    playerUnit.abilities.destroy();
    opponentUnit.abilities.destroy();
  }
}

export function prepareBattleContext(
  options: PrepareBattleContextOptions,
): PreparedBattleContext {
  if (!BATTLE_STATE_STRATEGIES.has(options.strategyId)) {
    throw new Error('战斗状态策略未声明或无效');
  }
  assertStrategyResources(
    options.strategyId,
    options.playerState,
    options.opponentState,
  );
  const player = deepFreeze(structuredClone(options.player));
  const opponent = deepFreeze(structuredClone(options.opponent));
  const initConfig: ResolvedBattleInitConfigV5 = {
    player: resolveUnitInit(options.playerState),
    opponent: resolveUnitInit(options.opponentState),
  };
  const entryState = projectBattleEntryState({
    player,
    opponent,
    initConfig,
  });
  const frozenInitConfig = deepFreeze(structuredClone(initConfig));
  const frozenEntryState = deepFreeze(entryState);
  const frozenConditionBaseline = options.conditionBaseline
    ? deepFreeze(structuredClone(options.conditionBaseline))
    : undefined;
  const context = Object.freeze({
    strategyId: options.strategyId,
    player,
    opponent,
    initConfig: frozenInitConfig,
    entryState: frozenEntryState,
    conditionBaseline: frozenConditionBaseline,
  });
  PREPARED_CONTEXTS.add(context);
  return context;
}

export function assertPreparedBattleContext(
  context: PreparedBattleContext,
): void {
  if (
    !context ||
    typeof context !== 'object' ||
    !PREPARED_CONTEXTS.has(context)
  ) {
    throw new Error('战斗必须使用 prepareBattleContext 生成的已解析上下文');
  }
}

export function prepareStandardFullBattle(args: {
  player: CultivatorCombatInput;
  opponent: CultivatorCombatInput;
  playerFragment?: BattleUnitInitFragment;
  opponentFragment?: BattleUnitInitFragment;
  strategyId?: Extract<
    BattleStateStrategyId,
    'standard_full' | 'training_custom'
  >;
}): PreparedBattleContext {
  return prepareBattleContext({
    strategyId: args.strategyId ?? 'standard_full',
    player: args.player,
    opponent: args.opponent,
    playerState: {
      resources: { kind: 'full' },
      fragment: args.playerFragment,
    },
    opponentState: {
      resources: { kind: 'full' },
      fragment: args.opponentFragment,
    },
  });
}
