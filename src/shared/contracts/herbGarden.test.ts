import {
  CULTIVATION_METHODS,
  HIDDEN_SPIRIT_SEED_KEY,
  createSpiritSeedDetails,
  nextHerbGardenStage,
  resolveCultivationMethod,
  resolveOutcomeKind,
} from './herbGarden';

describe('spirit herb garden domain', () => {
  it('writes a deterministic hidden seed profile once', () => {
    const first = createSpiritSeedDetails('fixed-seed', 'dungeon');
    const second = createSpiritSeedDetails('fixed-seed', 'dungeon');
    expect(first).toEqual(second);
    expect(first.fingerprint).toHaveLength(7);
    expect(first[HIDDEN_SPIRIT_SEED_KEY]?.preferredTags).toHaveLength(2);
  });

  it('advances through exactly three cultivation stages', () => {
    expect(nextHerbGardenStage('germination')).toBe('growth');
    expect(nextHerbGardenStage('growth')).toBe('formation');
    expect(nextHerbGardenStage('formation')).toBe('ready');
  });

  it('scores preferred methods above avoided methods without exposing tags', () => {
    const details = createSpiritSeedDetails('method-fit');
    const hidden = details[HIDDEN_SPIRIT_SEED_KEY]!;
    const preferred = CULTIVATION_METHODS.find((method) =>
      hidden.preferredTags.includes(method.tag),
    )!;
    const avoided = CULTIVATION_METHODS.find((method) =>
      hidden.avoidedTags.includes(method.tag),
    )!;
    expect(
      resolveCultivationMethod(hidden, preferred.id).scoreDelta,
    ).toBeGreaterThan(resolveCultivationMethod(hidden, avoided.id).scoreDelta);
  });

  it('keeps final outcomes inside the bounded product set', () => {
    const hidden = createSpiritSeedDetails('outcome')[HIDDEN_SPIRIT_SEED_KEY]!;
    const outcomes = [0, 0.1, 0.5, 0.99].map((roll) =>
      resolveOutcomeKind(hidden, 48, roll),
    );
    expect(
      outcomes.every((outcome) =>
        ['herb', 'spirit_fruit', 'treasure'].includes(outcome),
      ),
    ).toBe(true);
  });
});
