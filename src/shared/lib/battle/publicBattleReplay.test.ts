import type {
  AttrsStateView,
  UnitStateSnapshot,
} from '@shared/engine/battle-v5/systems/state/types';
import type { BattleRecordV3 } from '@shared/types/battle';
import { toPublicBattleReplayV1 } from './publicBattleReplay';

const attrs: AttrsStateView = {
  attributeModelVersion: 2,
  vitality: 10,
  strength: 11,
  spirit: 12,
  endurance: 13,
  speed: 14,
  willpower: 15,
  atk: 100,
  def: 80,
  magicAtk: 90,
  magicDef: 70,
  actionSpeed: 14,
  critRate: 0.1,
  critDamageMult: 1.5,
  evasionRate: 0.05,
  controlHit: 0.1,
  controlResistance: 0.1,
  armorPenetration: 0,
  magicPenetration: 0,
  critResist: 0,
  critDamageReduction: 0,
  accuracy: 1,
  healAmplify: 0,
  maxHp: 1000,
  maxMp: 500,
};

function snapshot(id: string, name: string): UnitStateSnapshot {
  return {
    id,
    name,
    alive: true,
    hp: { current: 900, max: 1000, percent: 90 },
    mp: { current: 400, max: 500, percent: 80 },
    shield: 20,
    attrs: { ...attrs },
    baseAttrs: { ...attrs, atk: 80 },
    buffs: [],
    combatResources: [],
    cooldowns: [],
    canAct: true,
  };
}

function createRecord(): BattleRecordV3 {
  const player = snapshot('player', '青玄子');
  const opponent = snapshot('opponent', '赤霄真人');
  return {
    participants: {
      player: { id: player.id, name: player.name },
      opponent: { id: opponent.id, name: opponent.name },
    },
    outcome: {
      winner: { id: player.id, name: player.name },
      loser: { id: opponent.id, name: opponent.name },
      turns: 1,
    },
    sequences: [
      {
        id: 'sequence-1',
        turn: 1,
        phase: 'battle_init',
        facts: [],
      },
    ],
    stateTimeline: {
      unitIds: [player.id, opponent.id],
      unitNames: {
        [player.id]: player.name,
        [opponent.id]: opponent.name,
      },
      frames: [
        {
          frameId: 1,
          turn: 1,
          phase: 'battle_init',
          sourceSequenceId: 'sequence-1',
          units: { [player.id]: player, [opponent.id]: opponent },
          deltas: {
            [player.id]: {
              id: player.id,
              name: player.name,
              hp: { from: 1000, to: 900, change: -100 },
              attrs: { atk: { from: 80, to: 100 } },
              baseAttrs: { atk: { from: 80, to: 80 } },
            },
          },
        },
      ],
    },
    finalSnapshots: { winner: player, loser: opponent },
  };
}

describe('toPublicBattleReplayV1', () => {
  it('removes exact attributes from every snapshot and delta', () => {
    const record = createRecord();
    const projected = toPublicBattleReplayV1(record);

    for (const frame of projected.stateTimeline.frames) {
      for (const unit of Object.values(frame.units)) {
        expect(unit).not.toHaveProperty('attrs');
        expect(unit).not.toHaveProperty('baseAttrs');
      }
      for (const delta of Object.values(frame.deltas ?? {})) {
        expect(delta).not.toHaveProperty('attrs');
        expect(delta).not.toHaveProperty('baseAttrs');
      }
    }
    expect(projected.finalSnapshots.winner).not.toHaveProperty('attrs');
    expect(projected.finalSnapshots.loser).not.toHaveProperty('baseAttrs');
    expect(JSON.stringify(projected)).not.toContain('"attrs"');
    expect(JSON.stringify(projected)).not.toContain('"baseAttrs"');
  });

  it('preserves the battle process without mutating the source record', () => {
    const record = createRecord();
    const before = structuredClone(record);

    const projected = toPublicBattleReplayV1(record);

    expect(projected.participants).toEqual(record.participants);
    expect(projected.outcome).toEqual(record.outcome);
    expect(projected.sequences).toEqual(record.sequences);
    expect(record).toEqual(before);
  });
});
