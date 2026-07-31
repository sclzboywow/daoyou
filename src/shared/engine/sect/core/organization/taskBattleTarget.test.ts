import type { CultivatorCombatInput } from '@shared/engine/battle-v5/adapters/CultivatorCombatAdapter';
import { describe, expect, it } from 'vitest';
import {
  SECT_BATTLE_TARGET_SCHEMA_VERSION,
  SectBattleTargetSnapshotSchema,
  readSectBattleTargetSnapshot,
  resolveSectBattleTargetRealmCandidates,
  summarizeSectBattleTarget,
} from './taskBattleTarget';

function combatantFixture(): CultivatorCombatInput {
  return {
    id: '1e05106f-b997-4c77-a523-4a5191dc3f24',
    name: '锁定目标',
    realm: '金丹',
    realm_stage: '后期',
    attributes: {
      vitality: 70,
      spirit: 80,
      wisdom: 90,
      speed: 100,
      willpower: 110,
    },
    spiritual_roots: [{ element: '水', strength: 90 }],
    pre_heaven_fates: [{ name: '静水流深' }],
    cultivations: [],
    skills: [],
    inventory: { artifacts: [] },
    equipped: { weapon: null, armor: null, accessory: null },
  };
}

describe('sect battle target snapshot', () => {
  it.each([
    ['same-sect', '金丹', ['金丹']],
    ['other-sect', '炼气', ['炼气']],
    ['other-sect', '金丹', ['金丹', '筑基']],
    ['other-sect', '渡劫', ['渡劫', '大乘']],
  ] as const)(
    'resolves %s target realm candidates from %s',
    (acquisition, realm, expected) => {
      expect(
        resolveSectBattleTargetRealmCandidates(realm, acquisition),
      ).toEqual(expected);
    },
  );

  it('round-trips a complete cultivator target through JSON', () => {
    const snapshot = SectBattleTargetSnapshotSchema.parse({
      schemaVersion: SECT_BATTLE_TARGET_SCHEMA_VERSION,
      kind: 'cultivator',
      sourceCultivatorId: '1e05106f-b997-4c77-a523-4a5191dc3f24',
      sourceSectId: 'source-sect',
      sourceSectName: '来源宗门',
      lockedAt: '2026-07-29T08:00:00.000Z',
      challengeTitle: '悬赏令·讨伐',
      name: '锁定目标',
      description: '领取时锁定的外宗目标。',
      realm: '金丹',
      realmStage: '后期',
      combatant: structuredClone(combatantFixture()),
    });
    const restored = readSectBattleTargetSnapshot({
      battleTarget: JSON.parse(JSON.stringify(snapshot)),
    });

    expect(restored).toEqual(snapshot);
    expect(summarizeSectBattleTarget(restored!)).toEqual({
      kind: 'cultivator',
      name: '锁定目标',
      description: '领取时锁定的外宗目标。',
      realm: '金丹',
      realmStage: '后期',
      sectId: 'source-sect',
      sectName: '来源宗门',
    });
  });

  it('keeps the locked combat build independent from later source changes', () => {
    const source = combatantFixture();
    const snapshot = SectBattleTargetSnapshotSchema.parse({
      schemaVersion: SECT_BATTLE_TARGET_SCHEMA_VERSION,
      kind: 'cultivator',
      sourceCultivatorId: source.id,
      sourceSectId: 'source-sect',
      sourceSectName: '来源宗门',
      lockedAt: '2026-07-29T08:00:00.000Z',
      challengeTitle: '宗门小比',
      name: source.name,
      description: '领取时锁定的同门对手。',
      realm: source.realm,
      realmStage: source.realm_stage,
      combatant: structuredClone(source),
    });

    source.name = '后来改名';
    source.attributes.vitality = 999;

    expect(snapshot.combatant.name).toBe('锁定目标');
    expect(snapshot.combatant.attributes.vitality).toBe(70);
  });
});
