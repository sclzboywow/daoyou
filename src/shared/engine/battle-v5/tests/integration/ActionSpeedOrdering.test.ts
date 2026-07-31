import { BattleEngineV5 } from '../../BattleEngineV5';
import { EventBus } from '../../core/EventBus';
import type { ActionPreEvent } from '../../core/events';
import {
  AttributeType,
  ModifierType,
} from '../../core/types';
import { Unit } from '../../units/Unit';
import { afterEach, describe, expect, it, vi } from 'vitest';

function unit(id: string, speed: number, willpower: number): Unit {
  return new Unit(id, id, {
    [AttributeType.SPEED]: speed,
    [AttributeType.WILLPOWER]: willpower,
  });
}

function firstActorId(player: Unit, opponent: Unit): string {
  let firstActor: Unit | undefined;
  EventBus.instance.subscribe<ActionPreEvent>('ActionPreEvent', (event) => {
    if (firstActor) return;
    firstActor = event.caster;
    const other = event.caster === player ? opponent : player;
    other.setHp(0);
  });

  const engine = new BattleEngineV5(player, opponent);
  engine.execute();
  engine.destroy();
  return firstActor?.id ?? '';
}

describe('BattleEngineV5 action speed ordering', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    EventBus.instance.reset();
  });

  it('uses willpower to break equal speed primary attributes', () => {
    const player = unit('player', 100, 10);
    const opponent = unit('opponent', 100, 100);

    expect(firstActorId(player, opponent)).toBe('opponent');
  });

  it('uses direct action speed modifiers without changing speed', () => {
    const player = unit('player', 100, 10);
    const opponent = unit('opponent', 80, 10);
    const baseSpeed = opponent.attributes.getValue(AttributeType.SPEED);
    opponent.attributes.addModifier({
      id: 'test-haste',
      attrType: AttributeType.ACTION_SPEED,
      type: ModifierType.ADD,
      value: 0.5,
      source: 'test',
    });

    expect(firstActorId(player, opponent)).toBe('opponent');
    expect(opponent.attributes.getValue(AttributeType.SPEED)).toBe(baseSpeed);
  });

  it('randomizes equal action speed instead of using insertion order', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    expect(firstActorId(
      unit('player', 100, 100),
      unit('opponent', 100, 100),
    )).toBe('player');

    EventBus.instance.reset();
    vi.mocked(Math.random).mockReturnValue(0.1);
    expect(firstActorId(
      unit('player', 100, 100),
      unit('opponent', 100, 100),
    )).toBe('opponent');
  });
});
