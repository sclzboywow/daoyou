import { ARTIFACT_AFFIXES } from '@shared/engine/creation-v2/affixes/definitions/artifactAffixes';
import { GONGFA_AFFIXES } from '@shared/engine/creation-v2/affixes/definitions/gongfaAffixes';
import type { AffixDefinition } from '@shared/engine/creation-v2/affixes/types';
import { AttributeType } from '@shared/engine/creation-v2/contracts/battle';
import { CreationTags } from '@shared/engine/shared/tag-domain';
import { describe, expect, it } from 'vitest';

function getAffix(affixes: AffixDefinition[], id: string): AffixDefinition {
  const affix = affixes.find((candidate) => candidate.id === id);
  expect(affix, `missing affix: ${id}`).toBeDefined();
  if (!affix) throw new Error(`missing affix: ${id}`);
  return affix;
}

describe('resource affix balance contracts', () => {
  it('keeps spirit-breaking awl simple while reducing both mana-burn scalars', () => {
    const affix = getAffix(
      ARTIFACT_AFFIXES,
      'artifact-weapon-spirit-breaking-awl',
    );
    const effect = affix.effectTemplate;

    expect(effect.type).toBe('mana_burn');
    if (effect.type !== 'mana_burn') {
      throw new Error('spirit-breaking awl must use mana_burn');
    }
    expect(effect.params.value).toMatchObject({
      attribute: AttributeType.ATK,
      coefficient: 0.04,
      targetMaxMpRatio: {
        base: 0.004,
        scale: 'quality',
        coefficient: 0.0008,
        max: 0.01,
      },
    });
  });

  it.each([
    {
      affixes: ARTIFACT_AFFIXES,
      id: 'artifact-defense-mana-recovery',
    },
    {
      affixes: ARTIFACT_AFFIXES,
      id: 'artifact-armor-tide-breaking-mail',
    },
    {
      affixes: GONGFA_AFFIXES,
      id: 'gongfa-school-crit-mana',
    },
  ])('$id scales mana recovery with willpower semantics', ({ affixes, id }) => {
    const affix = getAffix(affixes, id);
    const effect = affix.effectTemplate;

    expect(effect.type).toBe('heal');
    if (effect.type !== 'heal') {
      throw new Error(`${id} must use heal`);
    }
    expect(effect.params.target).toBe('mp');
    expect(effect.params.value.attribute).toBe(AttributeType.WILLPOWER);
    expect(`${affix.displayName}${affix.displayDescription}`).toContain('法力');
    expect([
      ...(affix.match.all ?? []),
      ...(affix.match.any ?? []),
    ]).toContain(CreationTags.MATERIAL.SEMANTIC_DIVINE);
  });
});
