import {
  buildMaterialEnergyProfile,
} from '@shared/engine/creation-v2/analysis/MaterialBalanceProfile';
import { MaterialFactsBuilder } from '@shared/engine/creation-v2/analysis/MaterialFactsBuilder';
import { ELEMENT_TO_MATERIAL_TAG } from '@shared/engine/creation-v2/config/CreationMappings';
import { DefaultIntentResolver } from '@shared/engine/creation-v2/resolvers/DefaultIntentResolver';
import { MaterialFingerprint } from '@shared/engine/creation-v2/types';

// ── MaterialBalanceProfile ──────────────────────────────────────────

describe('MaterialBalanceProfile', () => {
  it('应基于同一套规则构造 effective energy', () => {
    const fingerprints: MaterialFingerprint[] = [
      {
        materialName: '赤炎铁',
        materialType: 'ore',
        rank: '玄品',
        quantity: 1,
        explicitTags: [],
        semanticTags: ['Material.Semantic.Flame', 'Material.Semantic.Burst'],
        recipeTags: [],
        energyValue: 8,
        rarityWeight: 2,
      },
      {
        materialName: '雷髓晶',
        materialType: 'monster',
        rank: '玄品',
        quantity: 1,
        explicitTags: [],
        semanticTags: ['Material.Semantic.Flame'],
        recipeTags: [],
        energyValue: 7,
        rarityWeight: 2,
      },
    ];

    expect(buildMaterialEnergyProfile(fingerprints)).toEqual({
      baseEnergy: 15,
      diversityBonus: 2,
      coherenceBonus: 2,
      effectiveEnergy: 19,
      unlockScore: 18,
    });
  });

  it('应对额外材料的 unlock score 贡献做递减处理', () => {
    const fingerprints: MaterialFingerprint[] = [
      {
        materialName: '主材',
        materialType: 'ore',
        rank: '地品',
        quantity: 2,
        explicitTags: [],
        semanticTags: ['Material.Semantic.Blade'],
        recipeTags: [],
        energyValue: 11,
        rarityWeight: 4,
      },
      {
        materialName: '辅材一',
        materialType: 'monster',
        rank: '玄品',
        quantity: 2,
        explicitTags: [],
        semanticTags: ['Material.Semantic.Blade'],
        recipeTags: [],
        energyValue: 8,
        rarityWeight: 2,
      },
      {
        materialName: '辅材二',
        materialType: 'herb',
        rank: '玄品',
        quantity: 1,
        explicitTags: [],
        semanticTags: ['Material.Semantic.Spirit'],
        recipeTags: [],
        energyValue: 6,
        rarityWeight: 2,
      },
    ];

    const profile = buildMaterialEnergyProfile(fingerprints);

    expect(profile.effectiveEnergy).toBe(31);
    expect(profile.unlockScore).toBeLessThan(profile.effectiveEnergy);
    expect(profile.unlockScore).toBe(27);
  });
});

// ── MaterialFactsBuilder ────────────────────────────────────────────

describe('MaterialFactsBuilder', () => {
  const builder = new MaterialFactsBuilder();

  it('材料语义标签出现次数越高应越应居于 dominantTags 前位', () => {
    const fingerprints: MaterialFingerprint[] = Array.from({ length: 5 }).map(
      (_, index) => ({
        materialName: `赤炎材料-${index}`,
        materialType: index % 2 === 0 ? 'ore' : 'monster',
        rank: '玄品',
        quantity: 1,
        explicitTags: ['Material.Type.Ore'],
        semanticTags: ['Material.Semantic.Flame'],
        recipeTags: ['Recipe.ProductBias.Skill'],
        energyValue: 6,
        rarityWeight: 2,
        element: '火',
      }),
    );

    const facts = builder.build('skill', fingerprints);

    expect(facts.dominantTags[0]).toBe('Material.Semantic.Flame');
    expect(facts.dominantTags).toContain('Material.Semantic.Flame');
  });

  it('多材料 spread 投入时 unlock score 应低于 spendable energy', () => {
    const fingerprints: MaterialFingerprint[] = [
      {
        materialName: '主材',
        materialType: 'ore',
        rank: '地品',
        quantity: 2,
        explicitTags: ['Material.Type.Ore'],
        semanticTags: ['Material.Semantic.Blade'],
        recipeTags: ['Recipe.ProductBias.Skill'],
        energyValue: 11,
        rarityWeight: 4,
      },
      {
        materialName: '辅材一',
        materialType: 'monster',
        rank: '玄品',
        quantity: 2,
        explicitTags: ['Material.Type.Monster'],
        semanticTags: ['Material.Semantic.Blade'],
        recipeTags: ['Recipe.ProductBias.Skill'],
        energyValue: 8,
        rarityWeight: 2,
      },
      {
        materialName: '辅材二',
        materialType: 'herb',
        rank: '玄品',
        quantity: 1,
        explicitTags: ['Material.Type.Herb'],
        semanticTags: ['Material.Semantic.Spirit'],
        recipeTags: ['Recipe.ProductBias.Skill'],
        energyValue: 6,
        rarityWeight: 2,
      },
    ];

    const facts = builder.build('skill', fingerprints);

    expect(facts.energyProfile.effectiveEnergy).toBe(31);
    expect(facts.unlockScore).toBe(27);
    expect(facts.unlockScore).toBeLessThan(facts.energyProfile.effectiveEnergy);
  });
});

describe('DefaultIntentResolver', () => {
  it('应按材料能量与稀有度加权决定 elementBias，并保留元素 dominantTags', () => {
    const fingerprints: MaterialFingerprint[] = [
      {
        materialName: '赤炎主材',
        materialType: 'gongfa_manual',
        rank: '天品',
        quantity: 1,
        explicitTags: [ELEMENT_TO_MATERIAL_TAG['火']],
        semanticTags: ['Material.Semantic.Flame'],
        recipeTags: ['Recipe.ProductBias.GongFa'],
        energyValue: 40,
        rarityWeight: 6,
        element: '火',
      },
      {
        materialName: '冰魄辅材一',
        materialType: 'herb',
        rank: '凡品',
        quantity: 1,
        explicitTags: [ELEMENT_TO_MATERIAL_TAG['冰']],
        semanticTags: ['Material.Semantic.Freeze'],
        recipeTags: ['Recipe.ProductBias.GongFa'],
        energyValue: 4,
        rarityWeight: 1,
        element: '冰',
      },
      {
        materialName: '冰魄辅材二',
        materialType: 'herb',
        rank: '凡品',
        quantity: 1,
        explicitTags: [ELEMENT_TO_MATERIAL_TAG['冰']],
        semanticTags: ['Material.Semantic.Freeze'],
        recipeTags: ['Recipe.ProductBias.GongFa'],
        energyValue: 4,
        rarityWeight: 1,
        element: '冰',
      },
    ];

    const intent = new DefaultIntentResolver().resolve(
      {
        productType: 'gongfa',
        materials: [],
      },
      fingerprints,
    );

    expect(intent.elementBias).toBe('火');
    expect(intent.dominantTags).toEqual(
      expect.arrayContaining([
        ELEMENT_TO_MATERIAL_TAG['火'],
        ELEMENT_TO_MATERIAL_TAG['冰'],
      ]),
    );
  });
});
