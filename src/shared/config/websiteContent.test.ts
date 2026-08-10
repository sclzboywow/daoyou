import {
  DEFAULT_WEBSITE_CONTENT,
  WebsiteContentSchema,
  normalizeWebsiteContent,
} from './websiteContent';

describe('website content defaults', () => {
  it('keeps the bundled official content valid', () => {
    expect(WebsiteContentSchema.safeParse(DEFAULT_WEBSITE_CONTENT).success).toBe(
      true,
    );
  });

  it('documents the current black market interaction model', () => {
    const blackMarket = DEFAULT_WEBSITE_CONTENT.features.find(
      (feature) => feature.key === 'black-market',
    );

    expect(blackMarket).toBeDefined();
    expect(blackMarket?.summary).toContain('观察货物');
    expect(blackMarket?.summary).toContain('感知灵气');
    expect(blackMarket?.summary).toContain('出价');
    expect(blackMarket?.highlights.join(' ')).toContain('自由提问');
  });

  it('normalizes feature ordering into stable increments', () => {
    const normalized = normalizeWebsiteContent({
      ...DEFAULT_WEBSITE_CONTENT,
      features: DEFAULT_WEBSITE_CONTENT.features
        .slice(0, 2)
        .map((feature, index) => ({
          ...feature,
          sortOrder: index === 0 ? 30 : 10,
        })),
    });

    expect(normalized.features.map((feature) => feature.sortOrder)).toEqual([
      10, 20,
    ]);
    expect(normalized.features[0]?.key).toBe('sect');
  });
});
