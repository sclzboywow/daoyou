import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { GameplayTags } from '@shared/engine/shared/tag-domain';
import type { AbilityConfig } from '../../core/configs';
import { EventBus } from '../../core/EventBus';
import type {
  DeathPreventEvent,
  DamageRequestEvent,
} from '../../core/events';
import {
  AbilityType,
  AttributeType,
  DamageSource,
  DamageType,
} from '../../core/types';
import { AbilityFactory } from '../../factories/AbilityFactory';
import { DamageSystem } from '../../systems/DamageSystem';
import { Unit } from '../../units/Unit';
import {
  CombatV3EventType,
  type CombatResultCommittedEventV3,
} from '../../v3';
import { publishTestDamageRequest } from '../setup/combatV3TestHarness';

describe('DeathPreventEffect source-scoped triggers', () => {
  let damageSystem: DamageSystem | undefined;

  beforeEach(() => {
    EventBus.instance.reset();
    damageSystem = new DamageSystem();
  });

  afterEach(() => {
    damageSystem?.destroy();
    damageSystem = undefined;
    EventBus.instance.reset();
  });

  function createUnit(id: string, name: string): Unit {
    return new Unit(id, name, {
      [AttributeType.SPIRIT]: 100,
      [AttributeType.VITALITY]: 100,
      [AttributeType.SPEED]: 100,
      [AttributeType.WILLPOWER]: 100,
      [AttributeType.ENDURANCE]: 100,
    });
  }

  function addDeathPreventAbility(
    unit: Unit,
    id: string,
    triggerKey?: string,
  ): void {
    const config: AbilityConfig = {
      slug: id,
      name: id,
      type: AbilityType.PASSIVE_SKILL,
      tags: [GameplayTags.ABILITY.FUNCTION.BUFF],
      listeners: [
        {
          eventType: GameplayTags.EVENT.DAMAGE_TAKEN,
          scope: GameplayTags.SCOPE.OWNER_AS_TARGET,
          priority: 50,
          guard: {
            requireOwnerAlive: false,
            allowLethalWindow: true,
          },
          effects: [
            {
              type: 'death_prevent',
              params: triggerKey ? { triggerKey } : {},
            },
          ],
        },
      ],
    };

    unit.abilities.addAbility(AbilityFactory.create(config));
  }

  function dealLethalDamage(attacker: Unit, defender: Unit): void {
    publishTestDamageRequest({
      type: 'DamageRequestEvent',
      timestamp: Date.now(),
      caster: attacker,
      target: defender,
      damageSource: DamageSource.DIRECT,
      damageType: DamageType.TRUE,
      baseDamage: 1_000_000,
      finalDamage: 1_000_000,
    });
  }

  it('different sources can each prevent death once across separate lethal hits', () => {
    const attacker = createUnit('attacker', '破阵者');
    const defender = createUnit('defender', '持符者');
    const deathPreventEvents: DeathPreventEvent[] = [];
    const deathEvents: CombatResultCommittedEventV3[] = [];

    addDeathPreventAbility(defender, 'source_a', 'source:a');
    addDeathPreventAbility(defender, 'source_b', 'source:b');

    EventBus.instance.subscribe<DeathPreventEvent>(
      'DeathPreventEvent',
      (event) => deathPreventEvents.push(event),
    );
    EventBus.instance.subscribe<CombatResultCommittedEventV3>(
      CombatV3EventType.RESULT_COMMITTED,
      (event) => {
        if (event.result.type === 'unit_died') deathEvents.push(event);
      },
    );

    dealLethalDamage(attacker, defender);
    expect(defender.isAlive()).toBe(true);
    expect(defender.getCurrentHp()).toBe(1);
    expect(deathPreventEvents.map((event) => event.sourceKey)).toEqual([
      'source:a',
    ]);

    dealLethalDamage(attacker, defender);
    expect(defender.isAlive()).toBe(true);
    expect(defender.getCurrentHp()).toBe(1);
    expect(deathPreventEvents.map((event) => event.sourceKey)).toEqual([
      'source:a',
      'source:b',
    ]);

    dealLethalDamage(attacker, defender);
    expect(defender.isAlive()).toBe(false);
    expect(deathPreventEvents.map((event) => event.sourceKey)).toEqual([
      'source:a',
      'source:b',
    ]);
    expect(deathEvents).toHaveLength(1);
  });

  it('the same source does not prevent death twice', () => {
    const attacker = createUnit('attacker', '破阵者');
    const defender = createUnit('defender', '持符者');
    const deathPreventEvents: DeathPreventEvent[] = [];
    const deathEvents: CombatResultCommittedEventV3[] = [];

    addDeathPreventAbility(defender, 'same_source', 'source:same');

    EventBus.instance.subscribe<DeathPreventEvent>(
      'DeathPreventEvent',
      (event) => deathPreventEvents.push(event),
    );
    EventBus.instance.subscribe<CombatResultCommittedEventV3>(
      CombatV3EventType.RESULT_COMMITTED,
      (event) => {
        if (event.result.type === 'unit_died') deathEvents.push(event);
      },
    );

    dealLethalDamage(attacker, defender);
    expect(defender.isAlive()).toBe(true);
    expect(deathPreventEvents.map((event) => event.sourceKey)).toEqual([
      'source:same',
    ]);

    dealLethalDamage(attacker, defender);
    expect(defender.isAlive()).toBe(false);
    expect(deathPreventEvents.map((event) => event.sourceKey)).toEqual([
      'source:same',
    ]);
    expect(deathEvents).toHaveLength(1);
  });

  it('only consumes one source in a single lethal damage window', () => {
    const attacker = createUnit('attacker', '破阵者');
    const defender = createUnit('defender', '持符者');
    const deathPreventEvents: DeathPreventEvent[] = [];

    addDeathPreventAbility(defender, 'first_source', 'source:first');
    addDeathPreventAbility(defender, 'second_source', 'source:second');

    EventBus.instance.subscribe<DeathPreventEvent>(
      'DeathPreventEvent',
      (event) => deathPreventEvents.push(event),
    );

    dealLethalDamage(attacker, defender);

    expect(defender.isAlive()).toBe(true);
    expect(deathPreventEvents.map((event) => event.sourceKey)).toEqual([
      'source:first',
    ]);
  });
});
