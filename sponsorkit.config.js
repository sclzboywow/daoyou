import { defineConfig, tierPresets } from 'sponsorkit';

const usdToCny = Number.parseFloat(
  process.env.SPONSORKIT_AFDIAN_EXCHANGE_RATE ?? '6.75',
);

if (!Number.isFinite(usdToCny) || usdToCny <= 0) {
  throw new Error('SPONSORKIT_AFDIAN_EXCHANGE_RATE 必须是正数');
}

const cny = (amount) => amount / usdToCny;

export default defineConfig({
  mode: 'sponsors',
  providers: ['afdian'],
  afdian: {
    exchangeRate: usdToCny,
    includePurchases: true,
    purchaseEffectivity: 30,
  },
  outputDir: './sponsorkit',
  name: 'sponsors',
  renderer: 'tiers',
  width: 900,
  formats: ['json', 'svg', 'png'],
  includePrivate: false,
  includePastSponsors: true,
  tiers: [
    {
      title: '此间有名',
      monthlyDollars: -1,
      preset: tierPresets.xs,
    },
    {
      title: '共证长生',
      monthlyDollars: cny(188),
      preset: tierPresets.xl,
    },
    {
      title: '长夜护道',
      monthlyDollars: cny(98),
      preset: tierPresets.large,
    },
    {
      title: '山水同程',
      monthlyDollars: cny(38),
      preset: tierPresets.medium,
    },
    {
      title: '一盏微光',
      monthlyDollars: 0,
      preset: tierPresets.base,
    },
  ],
});
