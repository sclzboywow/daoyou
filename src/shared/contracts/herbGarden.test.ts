import { QI_ACTION_COSTS } from '@shared/config/qiSystem';
import {
  CULTIVATION_METHODS,
  FORMATION_METHODS,
  HERB_GARDEN_MAX_OBSERVATIONS_PER_STAGE,
  canCultivateSeedQuality,
  createSpiritSeedDetails,
  getHerbGardenMaxSeedQuality,
  nextHerbGardenStage,
  readSpiritSeedSpec,
  resolveCultivationMethod,
  resolveOutcomeKind,
  resolveOutcomeQuality,
  resolveOutcomeQuantity,
  resolveSpiritFruitEffects,
} from './herbGarden';

describe('spirit herb garden domain', () => {
  it('creates a deterministic, layered hidden seed profile', () => {
    const first = createSpiritSeedDetails('fixed-seed', 'dungeon');
    const second = createSpiritSeedDetails('fixed-seed', 'dungeon');
    expect(first).toEqual(second);
    expect(first.fingerprint).toHaveLength(7);
    expect(first.seedSpec?.preferredMethodTags).toHaveLength(2);
    expect(first.seedSpec?.preferredEnvironmentTags).toHaveLength(2);
    expect(first.seedSpec?.growthTraitTags).toHaveLength(3);
    expect(first.seedSpec?.semanticTags.length).toBeGreaterThan(0);
  });

  it('advances through exactly three cultivation stages', () => {
    expect(nextHerbGardenStage('germination')).toBe('growth');
    expect(nextHerbGardenStage('growth')).toBe('formation');
    expect(nextHerbGardenStage('formation')).toBe('ready');
  });

  it('registers ten stage-bound methods and four formation choices', () => {
    expect(CULTIVATION_METHODS).toHaveLength(10);
    expect(FORMATION_METHODS).toHaveLength(4);
    expect(
      CULTIVATION_METHODS.every((method) => method.stages.length > 0),
    ).toBe(true);
  });

  it('keeps three observation choices so one clue direction stays unknown', () => {
    expect(HERB_GARDEN_MAX_OBSERVATIONS_PER_STAGE).toBe(3);
  });

  it('keeps qi acceleration aligned with the unified qi ledger cost', () => {
    const acceleration = CULTIVATION_METHODS.find(
      (method) => method.id === 'qi_acceleration',
    );
    expect(acceleration?.cost).toEqual({
      kind: 'qi',
      amount: QI_ACTION_COSTS.herb_garden_qi_acceleration,
    });
  });

  it('keeps LLM assessment inside deterministic rule bounds', () => {
    const spec = readSpiritSeedSpec(createSpiritSeedDetails('method-fit'))!;
    const preferred = CULTIVATION_METHODS.find((method) =>
      method.methodTags.some((tag) => spec.preferredMethodTags.includes(tag)),
    )!;
    const avoided = CULTIVATION_METHODS.find((method) =>
      method.methodTags.some((tag) => spec.avoidedMethodTags.includes(tag)),
    )!;
    const preferredRule = resolveCultivationMethod(spec, preferred.id);
    const avoidedRule = resolveCultivationMethod(spec, avoided.id);
    expect(preferredRule.scoreDelta).toBeGreaterThan(avoidedRule.scoreDelta);
    expect(preferredRule.allowedAssessments).toContain('aligned');
    expect(avoidedRule.allowedAssessments).toContain('conflict');
  });

  it('lets formation choice guide type without allowing unsupported treasure', () => {
    const spec = readSpiritSeedSpec(createSpiritSeedDetails('outcome'))!;
    expect(resolveOutcomeKind(spec, 'leaf_medicine', 40, 0.1, '灵品')).toBe(
      'herb',
    );
    expect(resolveOutcomeKind(spec, 'treasure_return', 80, 0, '凡品')).toBe(
      'herb',
    );
    expect(
      ['herb', 'spirit_fruit'].includes(
        resolveOutcomeKind(spec, 'fruit_bloom', 40, 0.4, '玄品'),
      ),
    ).toBe(true);
  });

  it('keeps final quality at the seed rank or one adjacent rank', () => {
    const outcomes = [0, 0.5, 0.99].map((roll) =>
      resolveOutcomeQuality('玄品', 60, roll),
    );
    expect(
      outcomes.every((quality) => ['灵品', '玄品', '真品'].includes(quality)),
    ).toBe(true);
  });

  it('uses realm as a seed-quality cap without changing facility method unlocks', () => {
    expect(getHerbGardenMaxSeedQuality('炼气')).toBe('灵品');
    expect(canCultivateSeedQuality('筑基', '玄品')).toBe(true);
    expect(canCultivateSeedQuality('筑基', '真品')).toBe(false);
    expect(
      CULTIVATION_METHODS.filter((method) => method.minGardenLevel <= 1),
    ).toHaveLength(3);
  });

  it('settles formation-specific quantities on the server', () => {
    expect(resolveOutcomeQuantity('herb', 'leaf_medicine', 30, 0)).toBe(7);
    expect(resolveOutcomeQuantity('spirit_fruit', 'fruit_bloom', 30, 0)).toBe(
      2,
    );
    expect(resolveOutcomeQuantity('herb', 'fruit_bloom', 30, 0)).toBe(3);
    expect(resolveOutcomeQuantity('tcdb', 'treasure_return', 30, 0)).toBe(1);
  });

  it('reuses registered condition operations for spirit fruit effects', () => {
    const waterFruit = resolveSpiritFruitEffects('玄品', '水');
    expect(waterFruit.family).toBe('mana');
    expect(waterFruit.operations.map((operation) => operation.type)).toEqual([
      'restore_resource',
      'gain_progress',
    ]);
    expect(resolveSpiritFruitEffects('真品', '雷').family).toBe('insight');
  });
});
