import { db } from '@server/lib/drizzle/db';
import {
  createItemLibraryEntry,
  findItemLibraryByItemIds,
  updateItemLibraryEntry,
} from '@server/lib/repositories/itemLibraryRepository';
import { ITEM_LIBRARY_SYSTEM_USER_ID } from '@server/lib/services/MaterialLibraryService';
import {
  createReputationShopItem,
  listReputationShopItems,
  updateReputationShopItem,
} from '@server/lib/services/ReputationShopService';
import {
  CreateItemLibraryEntrySchema,
  type CreateItemLibraryEntry,
} from '@shared/lib/itemLibrary';

const OFFICIAL_BUILD_ID = '9376f8c1873193bf93842d14dfaaf9e9f87c53ac';

type OfficialShopItem = {
  entry: CreateItemLibraryEntry;
  price: number;
  perUserLimit: number;
};

function officialEntry(input: unknown): CreateItemLibraryEntry {
  return CreateItemLibraryEntrySchema.parse(input);
}

const OFFICIAL_REPUTATION_CONSUMABLES: OfficialShopItem[] = [
  {
    entry: officialEntry({
      itemId: 'fu_reset_all_attr',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '归元洗髓符',
        type: '符箓',
        quality: '神品',
        description:
          '一张泛着古老金光的符咒，其上纹路流转不息。催动此符，可引动归元之力，重置六维自由分配并返还已投入的可分配属性点。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'attribute_reset',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'attribute_reset',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 100,
    perUserLimit: 1,
  },
  {
    entry: officialEntry({
      itemId: 'fulu_market_01',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '拍卖行贵宾符',
        type: '符箓',
        quality: '天品',
        description: '用于在拍卖行开启包间专属交易。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'auction_private_listing',
          sessionMode: 'lock_on_enter_settle_on_exit',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'auction_private_listing',
        sessionMode: 'lock_on_enter_settle_on_exit',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 5,
    perUserLimit: 5,
  },
  {
    entry: officialEntry({
      itemId: 'fulu_chat_01',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '空白传音符',
        type: '符箓',
        quality: '天品',
        description: '用于向好友发送传音，并可随信携带一件物品。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'friend_mail_send',
          sessionMode: 'lock_on_enter_settle_on_exit',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'friend_mail_send',
        sessionMode: 'lock_on_enter_settle_on_exit',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 8,
    perUserLimit: 5,
  },
  {
    entry: officialEntry({
      itemId: 'pill_qx_001',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '静念莲华丹',
        type: '丹药',
        quality: '玄品',
        description: '澄心静念、压制心魔的破境辅助丹。',
        score: 1,
        spec: {
          kind: 'pill',
          family: 'breakthrough',
          operations: [
            {
              type: 'add_status',
              status: 'clear_mind',
              usesRemaining: 1,
              payload: { preventsInnerDemon: true },
            },
          ],
          consumeRules: {
            scene: 'out_of_battle_only',
            quotaCategory: 'none',
          },
          alchemyMeta: {
            source: 'improvised',
            sourceMaterials: [],
            analysisVersion: 2,
            propertyVector: [],
            sourceMaterialVectors: [],
            stability: 80,
            toxicityRating: 5,
            appearance: 'middle',
            tags: ['breakthrough'],
          },
        },
      },
      editorConfig: {
        kind: 'pill',
        family: 'breakthrough',
        quotaCategory: 'none',
        operationTypes: ['add_status'],
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 10,
    perUserLimit: 2,
  },
  {
    entry: officialEntry({
      itemId: 'pill_jiedu_02',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '化尘丹',
        type: '丹药',
        quality: '地品',
        description: '以毒攻毒，服用后降低 35 点丹毒。',
        score: 1,
        spec: {
          kind: 'pill',
          family: 'detox',
          operations: [
            {
              type: 'change_gauge',
              gauge: 'pillToxicity',
              delta: -35,
            },
          ],
          consumeRules: {
            scene: 'out_of_battle_only',
            quotaCategory: 'none',
          },
          alchemyMeta: {
            source: 'improvised',
            sourceMaterials: [],
            analysisVersion: 2,
            propertyVector: [],
            sourceMaterialVectors: [],
            stability: 80,
            toxicityRating: 0,
            appearance: 'middle',
            tags: ['detox'],
          },
        },
      },
      editorConfig: {
        kind: 'pill',
        family: 'detox',
        quotaCategory: 'none',
        operationTypes: ['change_gauge'],
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 10,
    perUserLimit: 5,
  },
  {
    entry: officialEntry({
      itemId: 'pill_jiedu_01',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '清虚散',
        type: '丹药',
        quality: '玄品',
        description: '清虚化毒，服用后降低 20 点丹毒。',
        score: 1,
        spec: {
          kind: 'pill',
          family: 'detox',
          operations: [
            {
              type: 'change_gauge',
              gauge: 'pillToxicity',
              delta: -20,
            },
          ],
          consumeRules: {
            scene: 'out_of_battle_only',
            quotaCategory: 'none',
          },
          alchemyMeta: {
            source: 'improvised',
            sourceMaterials: [],
            analysisVersion: 2,
            propertyVector: [],
            sourceMaterialVectors: [],
            stability: 80,
            toxicityRating: 0,
            appearance: 'middle',
            tags: ['detox'],
          },
        },
      },
      editorConfig: {
        kind: 'pill',
        family: 'detox',
        quotaCategory: 'none',
        operationTypes: ['change_gauge'],
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 4,
    perUserLimit: 8,
  },
  {
    entry: officialEntry({
      itemId: 'talisman_qi_restore_medium',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '中聚灵符',
        type: '符箓',
        quality: '玄品',
        description:
          '使用后恢复 100 点天地灵气，受每日符箓使用次数和灵气溢出上限约束。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'qi_restore_medium',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'qi_restore_medium',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 95,
    perUserLimit: 5,
  },
  {
    entry: officialEntry({
      itemId: 'talisman_qi_restore_large',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '大聚灵符',
        type: '符箓',
        quality: '真品',
        description:
          '使用后恢复 200 点天地灵气，受每日符箓使用次数和灵气溢出上限约束。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'qi_restore_large',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'qi_restore_large',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 180,
    perUserLimit: 2,
  },
  {
    entry: officialEntry({
      itemId: 'talisman_qi_restore_small',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '小聚灵符',
        type: '符箓',
        quality: '灵品',
        description:
          '使用后恢复 50 点天地灵气，受每日符箓使用次数和灵气溢出上限约束。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'qi_restore_small',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'qi_restore_small',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 50,
    perUserLimit: 10,
  },
  {
    entry: officialEntry({
      itemId: 'pill_life_incr_01',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '延年益寿丹',
        type: '丹药',
        quality: '玄品',
        description: '服用后增加 50 年寿元。',
        score: 1,
        spec: {
          kind: 'pill',
          family: 'longevity',
          operations: [{ type: 'increase_lifespan', value: 50 }],
          consumeRules: {
            scene: 'out_of_battle_only',
            quotaCategory: 'longevity',
          },
          alchemyMeta: {
            source: 'improvised',
            sourceMaterials: [],
            analysisVersion: 2,
            propertyVector: [],
            sourceMaterialVectors: [],
            dominantElement: '土',
            stability: 80,
            toxicityRating: 5,
            appearance: 'middle',
            tags: ['longevity', '土'],
          },
        },
      },
      editorConfig: {
        kind: 'pill',
        family: 'longevity',
        quotaCategory: 'longevity',
        operationTypes: ['increase_lifespan'],
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 12,
    perUserLimit: 5,
  },
  {
    entry: officialEntry({
      itemId: 'pill_life_incr_02',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '养魂丹',
        type: '丹药',
        quality: '天品',
        description: '温养神魂，服用后增加 100 年寿元。',
        score: 1,
        spec: {
          kind: 'pill',
          family: 'longevity',
          operations: [{ type: 'increase_lifespan', value: 100 }],
          consumeRules: {
            scene: 'out_of_battle_only',
            quotaCategory: 'longevity',
          },
          alchemyMeta: {
            source: 'improvised',
            sourceMaterials: [],
            analysisVersion: 2,
            propertyVector: [],
            sourceMaterialVectors: [],
            dominantElement: '土',
            stability: 80,
            toxicityRating: 5,
            appearance: 'middle',
            tags: ['longevity', '土'],
          },
        },
      },
      editorConfig: {
        kind: 'pill',
        family: 'longevity',
        quotaCategory: 'longevity',
        operationTypes: ['increase_lifespan'],
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 30,
    perUserLimit: 5,
  },
  {
    entry: officialEntry({
      itemId: 'talisman_draw_gongfa',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '悟道演法符',
        type: '符箓',
        quality: '仙品',
        description: '用于在问法寻卷中抽取灵品及以上的功法秘籍。',
        score: 1,
        spec: {
          kind: 'talisman',
          scenario: 'draw_gongfa',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'draw_gongfa',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 10,
    perUserLimit: 10,
  },
  {
    entry: officialEntry({
      itemId: 'talisman_draw_skill',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '神通衍化符',
        type: '符箓',
        quality: '仙品',
        description: '用于在问法寻卷中抽取灵品及以上的神通秘籍。',
        score: 1,
        spec: {
          kind: 'talisman',
          scenario: 'draw_skill',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'draw_skill',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 10,
    perUserLimit: 10,
  },
  {
    entry: officialEntry({
      itemId: 'talisman_reshape_fate',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '天机逆命符',
        type: '符箓',
        quality: '仙品',
        description: '用于开启命格重塑并抽取新的命格候选。',
        score: 1,
        spec: {
          kind: 'talisman',
          scenario: 'fate_reshape',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'fate_reshape',
        sessionMode: 'consume_on_action',
        source: 'official_reputation_shop',
        officialBuildId: OFFICIAL_BUILD_ID,
      },
    }),
    price: 80,
    perUserLimit: 3,
  },
];

async function syncLibrary() {
  const entries = OFFICIAL_REPUTATION_CONSUMABLES.map((item) => item.entry);
  const existing = new Map(
    (await findItemLibraryByItemIds(entries.map((entry) => entry.itemId))).map(
      (entry) => [entry.itemId, entry],
    ),
  );
  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const current = existing.get(entry.itemId);
    if (current) {
      await updateItemLibraryEntry({
        id: current.id,
        entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      updated += 1;
    } else {
      await createItemLibraryEntry({
        entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      created += 1;
    }
  }

  return { created, updated };
}

async function syncShop() {
  const existing = new Map(
    (await listReputationShopItems()).map((item) => [
      item.itemLibraryItemId,
      item,
    ]),
  );
  let created = 0;
  let updated = 0;

  for (const item of OFFICIAL_REPUTATION_CONSUMABLES) {
    const input = {
      itemLibraryItemId: item.entry.itemId,
      price: item.price,
      quantity: 1,
      perUserLimit: item.perUserLimit,
      status: 'active' as const,
      sortOrder: 0,
    };
    const current = existing.get(item.entry.itemId);
    if (current) {
      await updateReputationShopItem({
        id: current.id,
        input,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      updated += 1;
    } else {
      await createReputationShopItem({
        input,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      created += 1;
    }
  }

  return { created, updated };
}

async function main() {
  const library = await syncLibrary();
  const shop = await syncShop();
  console.log(
    JSON.stringify(
      {
        officialBuildId: OFFICIAL_BUILD_ID,
        itemCount: OFFICIAL_REPUTATION_CONSUMABLES.length,
        library,
        shop,
      },
      null,
      2,
    ),
  );
  await db.$client.end();
}

await main();
