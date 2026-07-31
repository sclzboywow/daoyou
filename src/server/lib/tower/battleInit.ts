import type { AttributeModifierConfig } from '@shared/engine/battle-v5/core/configs';
import {
  mergeBattleUnitInitFragments,
} from '@shared/engine/battle-v5/setup/BattleStateStrategy';
import type { BattleUnitInitFragment } from '@shared/engine/battle-v5/setup/types';
import {
  createCombatUnitFromCultivator,
  type CultivatorCombatInput,
} from '@shared/engine/battle-v5/adapters/CultivatorCombatAdapter';
import type {
  ConditionStatusInstance,
  ConditionStatusKey,
  CultivatorCondition,
} from '@shared/types/condition';
import {
  buildTowerBlessingAttributeModifiers,
  buildTowerEncounterAttributeModifiers,
  type TowerBlessingId,
  type TowerFloorKind,
} from '@shared/lib/tower';
import { buildConditionBattleUnitInitFragment } from '@shared/lib/conditionBattle';
import type { UnitStateSnapshot } from '@shared/engine/battle-v5/systems/state/types';
import { ConditionService } from '@server/lib/services/ConditionService';

const WOUND_ORDER: ConditionStatusKey[] = [
  'minor_wound',
  'major_wound',
  'near_death',
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function applyModifiersToUnit(
  cultivator: CultivatorCombatInput,
  modifiers: AttributeModifierConfig[],
) {
  const unit = createCombatUnitFromCultivator(cultivator);

  modifiers.forEach((modifier, index) => {
    unit.attributes.addModifier({
      id: `tower-blessing:${modifier.attrType}:${modifier.type}:${index}`,
      attrType: modifier.attrType,
      type: modifier.type,
      value: modifier.value,
      source: {
        sourceType: 'battle_init',
        sourceKey: 'tower-blessing',
      },
    });
  });
  unit.updateDerivedStats();

  return unit;
}

function getTowerMaxResources(args: {
  cultivator: CultivatorCombatInput;
  condition: CultivatorCondition;
  blessings: Parameters<typeof buildTowerBlessingAttributeModifiers>[0];
}) {
  const unit = applyModifiersToUnit(
    {
      ...args.cultivator,
      condition: args.condition,
    },
    buildTowerBlessingAttributeModifiers(args.blessings),
  );

  return {
    maxHp: unit.getMaxHp(),
    maxMp: unit.getMaxMp(),
  };
}

function getFiniteCurrent(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
}

function withTowerResourceCaps(args: {
  condition: CultivatorCondition;
  rawCondition: CultivatorCondition | undefined;
  maxHp: number;
  maxMp: number;
}) {
  return {
    ...args.condition,
    resources: {
      hp: {
        current: clamp(
          getFiniteCurrent(
            args.rawCondition?.resources?.hp?.current,
            args.condition.resources.hp.current,
          ),
          0,
          args.maxHp,
        ),
        max: args.maxHp,
      },
      mp: {
        current: clamp(
          getFiniteCurrent(
            args.rawCondition?.resources?.mp?.current,
            args.condition.resources.mp.current,
          ),
          0,
          args.maxMp,
        ),
        max: args.maxMp,
      },
    },
  };
}

function applyPreBattleRecovery(args: {
  condition: CultivatorCondition;
  maxHp: number;
  maxMp: number;
  blessings: Partial<Record<TowerBlessingId, number>>;
}) {
  const breathingStacks = args.blessings.breathing_technique ?? 0;
  const meridianStacks = args.blessings.meridian_cycle ?? 0;
  const missingHp = Math.max(0, args.maxHp - args.condition.resources.hp.current);
  const missingMp = Math.max(0, args.maxMp - args.condition.resources.mp.current);

  const recoveredHp = Math.floor(missingHp * 0.1 * breathingStacks);
  const recoveredMp = Math.floor(missingMp * 0.15 * meridianStacks);

  return {
    hp: clamp(args.condition.resources.hp.current + recoveredHp, 0, args.maxHp),
    mp: clamp(args.condition.resources.mp.current + recoveredMp, 0, args.maxMp),
  };
}

function getWoundSeverity(key: ConditionStatusKey) {
  return WOUND_ORDER.indexOf(key);
}

function replaceWoundStatus(
  statuses: ConditionStatusInstance[],
  target: ConditionStatusKey,
  nowIso: string,
) {
  const currentWound = statuses
    .filter((status) => getWoundSeverity(status.key) >= 0)
    .sort((left, right) => getWoundSeverity(right.key) - getWoundSeverity(left.key))[0];

  const nextKey =
    currentWound && getWoundSeverity(currentWound.key) > getWoundSeverity(target)
      ? currentWound.key
      : target;

  return [
    ...statuses.filter((status) => getWoundSeverity(status.key) < 0),
    {
      key: nextKey,
      stacks: 1,
      source: 'battle' as const,
      duration: { kind: 'until_removed' } as const,
      createdAt: currentWound?.createdAt ?? nowIso,
      updatedAt: nowIso,
    },
  ];
}

export function buildTowerBattleInit(args: {
  cultivator: CultivatorCombatInput;
  condition: CultivatorCondition;
  blessings: Parameters<typeof buildTowerBlessingAttributeModifiers>[0];
  encounterKind: TowerFloorKind;
  recoverResources?: boolean;
  now?: Date;
}): {
  playerFragment: BattleUnitInitFragment;
  opponentFragment: BattleUnitInitFragment;
  normalizedCondition: CultivatorCondition;
} {
  const now = args.now ?? new Date();
  const normalizedCondition = ConditionService.normalizeCondition(
    args.cultivator,
    args.condition,
    now,
  );
  const { maxHp, maxMp } = getTowerMaxResources({
    cultivator: args.cultivator,
    condition: normalizedCondition,
    blessings: args.blessings,
  });
  const towerCondition = withTowerResourceCaps({
    condition: normalizedCondition,
    rawCondition: args.condition,
    maxHp,
    maxMp,
  });
  const recovered = args.recoverResources === false
    ? {
        hp: towerCondition.resources.hp.current,
        mp: towerCondition.resources.mp.current,
      }
    : applyPreBattleRecovery({
        condition: towerCondition,
        maxHp,
        maxMp,
        blessings: args.blessings,
      });
  const battleStartCondition = {
    ...towerCondition,
    resources: {
      hp: { current: recovered.hp, max: maxHp },
      mp: { current: recovered.mp, max: maxMp },
    },
  };

  return {
    normalizedCondition: battleStartCondition,
    playerFragment:
      mergeBattleUnitInitFragments(
        {
          modifiers: buildTowerBlessingAttributeModifiers(args.blessings),
        },
        buildConditionBattleUnitInitFragment(battleStartCondition, now),
      ) ?? {},
    opponentFragment: {
      modifiers: buildTowerEncounterAttributeModifiers(args.encounterKind),
    },
  };
}

export function applyTowerBattleOutcome(args: {
  cultivator: CultivatorCombatInput;
  condition: CultivatorCondition;
  blessings: Partial<Record<TowerBlessingId, number>>;
  playerSnapshot: UnitStateSnapshot;
  didLose: boolean;
  now?: Date;
}) {
  const now = args.now ?? new Date();
  const normalizedCondition = ConditionService.normalizeCondition(
    args.cultivator,
    args.condition,
    now,
  );
  const { maxHp, maxMp } = getTowerMaxResources({
    cultivator: args.cultivator,
    condition: normalizedCondition,
    blessings: args.blessings,
  });
  const towerCondition = withTowerResourceCaps({
    condition: normalizedCondition,
    rawCondition: args.condition,
    maxHp,
    maxMp,
  });

  if (args.didLose) {
    return {
      ...towerCondition,
      resources: {
        hp: { current: 1, max: maxHp },
        mp: { current: 0, max: maxMp },
      },
      statuses: replaceWoundStatus(
        towerCondition.statuses,
        'near_death',
        now.toISOString(),
      ),
      timestamps: {
        ...towerCondition.timestamps,
        lastBattleAt: now.toISOString(),
        lastRecoveryAt: now.toISOString(),
      },
    };
  }

  const currentHp = clamp(args.playerSnapshot.hp.current, 0, maxHp);
  const currentMp = clamp(args.playerSnapshot.mp.current, 0, maxMp);
  const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
  let statuses = towerCondition.statuses;

  if (hpRatio <= 0.15) {
    statuses = replaceWoundStatus(statuses, 'major_wound', now.toISOString());
  } else if (hpRatio <= 0.35) {
    statuses = replaceWoundStatus(statuses, 'minor_wound', now.toISOString());
  }

  return {
    ...towerCondition,
    resources: {
      hp: { current: currentHp, max: maxHp },
      mp: { current: currentMp, max: maxMp },
    },
    statuses,
    timestamps: {
      ...towerCondition.timestamps,
      lastBattleAt: now.toISOString(),
      lastRecoveryAt: now.toISOString(),
    },
  };
}
