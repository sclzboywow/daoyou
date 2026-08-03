import { ARTIFACT_AFFIXES } from '@shared/engine/creation-v2/affixes/definitions/artifactAffixes';
import { GONGFA_AFFIXES } from '@shared/engine/creation-v2/affixes/definitions/gongfaAffixes';
import type { AffixDefinition } from '@shared/engine/creation-v2/affixes/types';
import {
  AttributeType,
  ModifierType,
} from '@shared/engine/creation-v2/contracts/battle';
import { CreationTags } from '@shared/engine/shared/tag-domain';
import { describe, expect, it } from 'vitest';

function getSingleAttributeModifier(affixes: AffixDefinition[], id: string) {
  const affix = affixes.find((candidate) => candidate.id === id);
  expect(affix, `missing affix: ${id}`).toBeDefined();
  if (!affix) throw new Error(`missing affix: ${id}`);

  const effect = affix.effectTemplate;
  expect(effect.type).toBe('attribute_modifier');
  if (effect.type !== 'attribute_modifier') {
    throw new Error(`${id} must use attribute_modifier`);
  }

  expect('modifiers' in effect.params).toBe(false);
  if ('modifiers' in effect.params) {
    throw new Error(`${id} must define one attribute modifier`);
  }

  return { affix, modifier: effect.params };
}

describe('six-attribute gongfa and artifact affixes', () => {
  it.each([
    {
      affixes: GONGFA_AFFIXES,
      id: 'gongfa-foundation-strength',
      attrType: AttributeType.STRENGTH,
      modType: ModifierType.ADD,
    },
    {
      affixes: GONGFA_AFFIXES,
      id: 'gongfa-foundation-endurance',
      attrType: AttributeType.ENDURANCE,
      modType: ModifierType.ADD,
    },
    {
      affixes: ARTIFACT_AFFIXES,
      id: 'artifact-panel-strength',
      attrType: AttributeType.STRENGTH,
      modType: ModifierType.FIXED,
    },
    {
      affixes: ARTIFACT_AFFIXES,
      id: 'artifact-panel-endurance',
      attrType: AttributeType.ENDURANCE,
      modType: ModifierType.FIXED,
    },
  ])('$id targets its dedicated primary attribute', (spec) => {
    const { modifier } = getSingleAttributeModifier(spec.affixes, spec.id);

    expect(modifier.attrType).toBe(spec.attrType);
    expect(modifier.modType).toBe(spec.modType);
  });

  it.each([
    {
      affixes: GONGFA_AFFIXES,
      id: 'gongfa-foundation-wisdom',
      modType: ModifierType.FIXED,
    },
    {
      affixes: ARTIFACT_AFFIXES,
      id: 'artifact-panel-wisdom',
      modType: ModifierType.FIXED,
    },
  ])('$id preserves its legacy id while targeting critical rate', (spec) => {
    const { affix, modifier } = getSingleAttributeModifier(
      spec.affixes,
      spec.id,
    );

    expect(modifier.attrType).toBe(AttributeType.CRIT_RATE);
    expect(modifier.modType).toBe(spec.modType);
    expect(`${affix.displayName}${affix.displayDescription}`).toContain('暴击');
  });

  it.each([
    ['gongfa-foundation-heal-amplify', AttributeType.HEAL_AMPLIFY],
    ['gongfa-foundation-control-hit', AttributeType.CONTROL_HIT],
    [
      'gongfa-foundation-control-resistance',
      AttributeType.CONTROL_RESISTANCE,
    ],
  ])('%s uses fixed percentage-point semantics', (id, attrType) => {
    const { modifier } = getSingleAttributeModifier(GONGFA_AFFIXES, id);

    expect(modifier.attrType).toBe(attrType);
    expect(modifier.modType).toBe(ModifierType.FIXED);
  });

  it('keeps legacy wisdom ids and aligns material semantics with each role', () => {
    const allIds = [...GONGFA_AFFIXES, ...ARTIFACT_AFFIXES].map(
      (affix) => affix.id,
    );
    expect(allIds).toContain('gongfa-foundation-wisdom');
    expect(allIds).toContain('artifact-panel-wisdom');

    const gongfaStrength = getSingleAttributeModifier(
      GONGFA_AFFIXES,
      'gongfa-foundation-strength',
    ).affix;
    expect(gongfaStrength.match.all).toContain(
      CreationTags.MATERIAL.SEMANTIC_BLADE,
    );

    for (const [affixes, id] of [
      [GONGFA_AFFIXES, 'gongfa-foundation-endurance'],
      [ARTIFACT_AFFIXES, 'artifact-panel-endurance'],
    ] as const) {
      const endurance = getSingleAttributeModifier(affixes, id).affix;
      expect(endurance.match.all).toContain(
        CreationTags.MATERIAL.SEMANTIC_GUARD,
      );
      expect(endurance.match.any).toContain(
        CreationTags.MATERIAL.SEMANTIC_BONE,
      );
    }

    for (const [affixes, id] of [
      [GONGFA_AFFIXES, 'gongfa-foundation-wisdom'],
      [ARTIFACT_AFFIXES, 'artifact-panel-wisdom'],
    ] as const) {
      const criticalRate = getSingleAttributeModifier(affixes, id).affix;
      expect(criticalRate.match.all).toContain(
        CreationTags.MATERIAL.SEMANTIC_MANUAL,
      );
    }
  });
});
