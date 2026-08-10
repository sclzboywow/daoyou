import { z } from 'zod';

export const WebsiteHeroSchema = z.object({
  eyebrow: z.string().trim().max(80),
  title: z.string().trim().min(1).max(120),
  subtitle: z.string().trim().max(180),
  description: z.string().trim().max(800),
  primaryCtaLabel: z.string().trim().max(40),
  primaryCtaHref: z.string().trim().max(300),
  secondaryCtaLabel: z.string().trim().max(40),
  secondaryCtaHref: z.string().trim().max(300),
});

export const WebsiteFeatureSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, '玩法标识仅支持小写字母、数字和连字符'),
  title: z.string().trim().min(1).max(80),
  eyebrow: z.string().trim().max(80),
  summary: z.string().trim().min(1).max(800),
  highlights: z.array(z.string().trim().min(1).max(180)).max(8),
  imageUrl: z.string().trim().max(500),
  ctaLabel: z.string().trim().max(40),
  ctaHref: z.string().trim().max(300),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export const WebsiteUpdateSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/, '动态标识仅支持小写字母、数字和连字符'),
  type: z.enum(['announcement', 'update']),
  title: z.string().trim().min(1).max(160),
  summary: z.string().trim().min(1).max(800),
  href: z.string().trim().max(300),
  publishedAt: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, '发布日期格式应为 YYYY-MM-DD'),
  tags: z.array(z.string().trim().min(1).max(40)).max(8),
  pinned: z.boolean(),
  enabled: z.boolean(),
  sortOrder: z.number().int().min(0).max(999),
});

export const DEFAULT_WEBSITE_UPDATES = [
  {
    key: 'black-market-gameplay',
    type: 'update',
    title: '暗巷黑市玩法介绍上线',
    summary:
      '黑市没有统一标价。观察货物、感知灵气、检查破损、追问来历，再结合商人的身份与口吻决定如何出价。每次谈判都需要在有限线索中判断人、货与局势。',
    href: '/login',
    publishedAt: '2026-08-10',
    tags: ['新玩法', '暗巷黑市', '交易谈判'],
    pinned: true,
    enabled: true,
    sortOrder: 10,
  },
] satisfies z.input<typeof WebsiteUpdateSchema>[];

export const WebsiteSeoSchema = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(300),
  keywords: z.string().trim().max(300),
});

export const WebsiteContentSchema = z
  .object({
    hero: WebsiteHeroSchema,
    features: z.array(WebsiteFeatureSchema).max(24),
    updates: z
      .array(WebsiteUpdateSchema)
      .max(30)
      .default(() =>
        DEFAULT_WEBSITE_UPDATES.map((update) => ({
          ...update,
          tags: [...update.tags],
        })),
      ),
    seo: WebsiteSeoSchema,
  })
  .superRefine((content, context) => {
    const keys = new Set<string>();
    content.features.forEach((feature, index) => {
      if (keys.has(feature.key)) {
        context.addIssue({
          code: 'custom',
          path: ['features', index, 'key'],
          message: `玩法标识 ${feature.key} 重复`,
        });
      }
      keys.add(feature.key);
    });
    content.updates.forEach((update, index) => {
      if (keys.has(update.key)) {
        context.addIssue({
          code: 'custom',
          path: ['updates', index, 'key'],
          message: `动态标识 ${update.key} 重复`,
        });
      }
      keys.add(update.key);
    });
  });

export const WebsiteContentVersionSchema = z.object({
  id: z.string().min(1),
  publishedAt: z.string().min(1),
  publishedBy: z.string().min(1),
  action: z.enum(['publish', 'rollback']),
  sourceVersionId: z.string().optional(),
  content: WebsiteContentSchema,
});

export const WebsiteContentHistorySchema = z
  .array(WebsiteContentVersionSchema)
  .max(30);

export type WebsiteContent = z.infer<typeof WebsiteContentSchema>;
export type WebsiteFeature = z.infer<typeof WebsiteFeatureSchema>;
export type WebsiteUpdate = z.infer<typeof WebsiteUpdateSchema>;
export type WebsiteContentVersion = z.infer<typeof WebsiteContentVersionSchema>;

export const DEFAULT_WEBSITE_CONTENT: WebsiteContent = {
  hero: {
    eyebrow: '东方修真 · 自由成长 · 众生有性',
    title: '万界道友',
    subtitle: '在会变化、会回应的修真世界里，走出自己的道。',
    description:
      '从修行、宗门与秘境，到交易、炼制与斗法，每一条成长路径都由真实系统承接。世界中的人物有自己的立场与脾气，你的选择会改变下一步。',
    primaryCtaLabel: '开始修行',
    primaryCtaHref: '/signup',
    secondaryCtaLabel: '已有道号，直接登录',
    secondaryCtaHref: '/login',
  },
  features: [
    {
      key: 'black-market',
      title: '暗巷黑市',
      eyebrow: '察言观色 · 试探还价',
      summary:
        '黑市没有统一标价。面对性情不同的货主，你可以观察货物、感知灵气、查破损、问来历与出售缘由，再决定是否出价。报价只是谈判的开始，真正的成交取决于你对人、货与局势的判断。',
      highlights: [
        '多位商人拥有不同身份、口吻与交易风格',
        '外观、灵气、破损、来历与出售缘由均可主动查探',
        '自由提问与灵石报价共同推进谈判',
        '价格与线索存在不确定性，无法靠固定套路机械砍价',
      ],
      imageUrl: '',
      ctaLabel: '进入暗巷',
      ctaHref: '/login',
      enabled: true,
      sortOrder: 10,
    },
    {
      key: 'sect',
      title: '宗门修行',
      eyebrow: '传承 · 身份 · 道途',
      summary:
        '拜入宗门后，从经卷研习、神通配置到流派参悟逐步建立自己的传承。弟子身份、宗门设施与修行进度共同决定你能走多远。',
      highlights: [
        '宗门心法与神通形成明确成长链',
        '弟子身份与设施共同限制修行上限',
        '不同传承拥有独立战斗思路',
      ],
      imageUrl: '',
      ctaLabel: '寻访山门',
      ctaHref: '/login',
      enabled: true,
      sortOrder: 20,
    },
    {
      key: 'dungeon',
      title: '云游探秘',
      eyebrow: '抉择 · 风险 · 收获',
      summary:
        '秘境并非单纯点按钮领奖。每轮探索都会给出不同抉择，资源、战斗与退路共同构成风险，所得也会随着过程累积到最终结算。',
      highlights: [
        '多轮探索与动态事件',
        '结构化资源代价由服务端真实结算',
        '遭遇战、撤退与继续深入各有取舍',
      ],
      imageUrl: '',
      ctaLabel: '踏入秘境',
      ctaHref: '/login',
      enabled: true,
      sortOrder: 30,
    },
    {
      key: 'craft',
      title: '炼丹炼器',
      eyebrow: '材料 · 配方 · 造物',
      summary:
        '收集材料不是终点。通过炼丹、炼器与造物系统，把资源转化为真正能进入角色成长与交易循环的成果。',
      highlights: [
        '材料品质进入真实生产链',
        '丹药与法宝服务长期养成',
        '产物可继续进入其他玩法循环',
      ],
      imageUrl: '',
      ctaLabel: '开炉造物',
      ctaHref: '/login',
      enabled: true,
      sortOrder: 40,
    },
    {
      key: 'battle',
      title: '斗法争衡',
      eyebrow: '属性 · 神通 · 战局',
      summary:
        '角色属性、装备、神通与状态最终都会在战斗中兑现。挑战天骄、蜃楼试炼与各类遭遇，让每一次养成都有检验之处。',
      highlights: [
        '统一战斗模型承接角色成长',
        '神通与装备配置影响实际战局',
        '战斗记录可用于复盘与比较',
      ],
      imageUrl: '',
      ctaLabel: '入局斗法',
      ctaHref: '/login',
      enabled: true,
      sortOrder: 50,
    },
  ],
  updates: DEFAULT_WEBSITE_UPDATES.map((update) => ({
    ...update,
    tags: [...update.tags],
  })),
  seo: {
    title: '万界道友｜东方修真文字游戏',
    description:
      '万界道友是一款以自由成长、宗门传承、秘境探索、暗巷交易与战斗养成为核心的东方修真文字游戏。',
    keywords: '万界道友,修仙游戏,修真游戏,文字游戏,暗巷黑市,宗门,秘境',
  },
};

export function normalizeWebsiteContent(
  content: WebsiteContent,
): WebsiteContent {
  return {
    ...content,
    features: [...content.features]
      .sort(
        (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
      )
      .map((feature, index) => ({ ...feature, sortOrder: (index + 1) * 10 })),
    updates: [...content.updates]
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) ||
          b.publishedAt.localeCompare(a.publishedAt) ||
          a.sortOrder - b.sortOrder ||
          a.title.localeCompare(b.title),
      )
      .map((update, index) => ({ ...update, sortOrder: (index + 1) * 10 })),
  };
}
