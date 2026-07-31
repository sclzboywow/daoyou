import type { BuffConfig, AttributeModifierConfig } from '../core/configs';
import {
  AttributeType,
  type ModifierType,
} from '../core/types';

export type ResourcePointState =
  | { mode: 'absolute'; value: number }
  | { mode: 'percent'; value: number };

export interface PersistentCombatStatusV5 {
  version: 1;
  templateId: string;
  stacks: number;
  usesRemaining?: number;
  expiresAt?: number;
  payload?: Record<string, number | string | boolean>;
}

export interface BattleUnitInitStartingBuff {
  buff: BuffConfig;
  stacks?: number;
  source: 'self' | 'opponent';
}

export interface BattleUnitInitSpec {
  baseAttributeOverrides?: Partial<
    Record<
      | AttributeType.SPIRIT
      | AttributeType.VITALITY
      | AttributeType.SPEED
      | AttributeType.WILLPOWER
      | AttributeType.WISDOM,
      number
    >
  >;
  modifiers?: AttributeModifierConfig[];
  resourceState?: {
    hp?: ResourcePointState;
    mp?: ResourcePointState;
    shield?: number | ResourcePointState;
  };
  statusRefs?: PersistentCombatStatusV5[];
  startingBuffs?: BattleUnitInitStartingBuff[];
}

export type BattleUnitInitFragment = BattleUnitInitSpec;

export interface ResolvedBattleUnitInit
  extends Omit<BattleUnitInitSpec, 'resourceState'> {
  resourceState: {
    hp: ResourcePointState;
    mp: ResourcePointState;
    shield?: number | ResourcePointState;
  };
}

export interface BattleInitConfigV5 {
  player?: BattleUnitInitSpec;
  opponent?: BattleUnitInitSpec;
}

export interface ResolvedBattleInitConfigV5 {
  player: ResolvedBattleUnitInit;
  opponent: ResolvedBattleUnitInit;
}

export type BattleStateStrategyId =
  | 'standard_full'
  | 'persistent_world'
  | 'isolated_run'
  | 'training_custom';

export interface CombatStatusTemplateDisplay {
  icon: string;
  shortDesc?: string;
  path?: string;
  action?: string;
  showUses?: boolean;
  showExpiry?: boolean;
}

export interface CombatStatusTemplate {
  id: string;
  name: string;
  description: string;
  display: CombatStatusTemplateDisplay;
  toBattleInit(status: PersistentCombatStatusV5): BattleUnitInitSpec;
}

export interface TrainingRoomModifierDraft {
  id: string;
  attrType: AttributeType;
  type: Exclude<ModifierType, 'base'>;
  value: number;
}
