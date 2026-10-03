import { describe, expect, it } from 'vitest';
import {
  replaySeeker,
  startReplayTimeline,
} from '../combat-v6/replay-timeline';
import { createBattle, restoreBattle } from '../engine/combat-v6/core';
import { createDaoyouRuleset } from '../engine/combat-v6/rules-daoyou';
import {
  canRecoverCombat,
  recoverCombat,
  type RecoverySnapshot,
} from './combatRecovery';

const input = {
  ruleset: createDaoyouRuleset(),
  versions: {
    engineVersion: 'combat-v6',
    rulesetVersion: 'test',
    contentVersion: 'test',
    projectionVersion: 'test',
  },
  seed: 123,
  units: [
    {
      id: 'player',
      name: '我方',
      side: 0 as const,
      kind: 'player' as const,
      attrs: { hp: 20, maxHp: 101, mp: 2, maxMp: 51, speed: 10 },
    },
    {
      id: 'enemy',
      name: '敌方',
      side: 1 as const,
      kind: 'npc' as const,
      attrs: { hp: 100, maxHp: 100, speed: 1 },
    },
  ],
};
function fixture(): RecoverySnapshot {
  const battle = createBattle(input);
  const state = battle.snapshot();
  return {
    playerId: 'player',
    state,
    events: [...battle.log()],
    timeline: startReplayTimeline(state, [], battle.log().length - 1),
  };
}
describe('live rewarded recovery', () => {
  it('recovers HP/MP without advancing the round or RNG and records replay changes', () => {
    const s = fixture(),
      rng = s.state.rngState,
      round = s.state.round;
    expect(canRecoverCombat(s)).toBe(true);
    expect(recoverCombat(s, 'ticket')).toBe(true);
    expect(s.state.units[0].attrs).toMatchObject({ hp: 51, mp: 26 });
    expect(s.state.rngState).toBe(rng);
    expect(s.state.round).toBe(round);
    expect(
      replaySeeker(s.timeline)(s.timeline.frames.length).units[0],
    ).toMatchObject({ hp: 51, mp: 26 });
    const restored = restoreBattle(input, s.state, s.events);
    expect(restored.queryCommands('player').canSubmit).toBe(true);
  });
  it('same receipt is idempotent even after taking further damage', () => {
    const s = fixture();
    recoverCombat(s, 'ticket');
    s.state.units[0].attrs.hp = 3;
    const count = s.events.length;
    expect(recoverCombat(s, 'ticket')).toBe(false);
    expect(s.state.units[0].attrs.hp).toBe(3);
    expect(s.events).toHaveLength(count);
    expect(() => recoverCombat(s, 'another')).toThrow();
  });
  it('rejects ended, resolving, downed, dead, escaped, zero HP and non-low HP states', () => {
    for (const change of [
      (s: RecoverySnapshot) => (s.state.phase = 'ended'),
      (s: RecoverySnapshot) => (s.state.phase = 'resolve'),
      (s: RecoverySnapshot) => (s.state.units[0].flags.downed = true),
      (s: RecoverySnapshot) => (s.state.units[0].flags.dead = true),
      (s: RecoverySnapshot) => (s.state.units[0].flags.escaped = true),
      (s: RecoverySnapshot) => (s.state.units[0].attrs.hp = 0),
      (s: RecoverySnapshot) => (s.state.units[0].attrs.hp = 30),
    ]) {
      const s = fixture();
      change(s);
      const before = JSON.stringify(s);
      expect(() => recoverCombat(s, 'ticket')).toThrow();
      expect(JSON.stringify(s)).toBe(before);
    }
  });
  it('does not reduce mana above half or change enemies', () => {
    const s = fixture();
    s.state.units[0].attrs.mp = 48;
    const enemy = structuredClone(s.state.units[1]);
    recoverCombat(s, 'ticket');
    expect(s.state.units[0].attrs.mp).toBe(48);
    expect(s.state.units[1]).toEqual(enemy);
  });
});
