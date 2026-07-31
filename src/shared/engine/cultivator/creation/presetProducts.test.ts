import { describe, expect, it } from 'vitest';
import { AbilityFactory } from '@shared/engine/battle-v5/factories/AbilityFactory';
import { buildPresetArtifact } from './presetProducts';

describe('preset products', () => {
  it('buildPresetArtifact creates a V5-valid artifact projection', () => {
    const artifact = buildPresetArtifact({
      id: 'preset-artifact-1',
      name: '试锋金刃',
      slot: 'weapon',
      element: '金',
      affixIds: [
        'artifact-panel-weapon-dual-atk',
        'artifact-panel-atk',
        'artifact-defense-mana-recovery',
      ],
      realm: '筑基',
      realmStage: '后期',
      creatorName: '测试造物者',
      creatorCultivatorId: 'tester',
      isEquipped: true,
    });

    expect((artifact.productModel as { affixes?: unknown[] }).affixes?.length).toBeGreaterThan(0);
    expect((artifact.productModel as { metadata?: { anchorRealm?: string; anchorRealmStage?: string } }).metadata)
      .toMatchObject({
        anchorRealm: '筑基',
        anchorRealmStage: '后期',
      });
    expect(artifact.abilityConfig).toBeDefined();
    expect(() => AbilityFactory.create(artifact.abilityConfig!)).not.toThrow();
  });
});
