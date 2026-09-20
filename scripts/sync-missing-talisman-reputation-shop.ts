/**
 * Upsert missing talisman item-library entries and list them in reputation shop.
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/sync-missing-talisman-reputation-shop.ts
 */
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
  IDENTITY_RESHAPE_SCENARIO,
  IDENTITY_RESHAPE_TALISMAN_NAME,
} from '@shared/config/identityReshape';
import {
  SECT_MERIDIAN_RESET_TALISMAN_NAME,
  SECT_MERIDIAN_RESET_TALISMAN_SCENARIO,
} from '@shared/config/sectMeridianResetTalisman';
import { consumableSchema } from '@shared/contracts/resources/inventory';
import {
  CreateItemLibraryEntrySchema,
  type CreateItemLibraryEntry,
} from '@shared/lib/itemLibrary';

const PRICE = 200;

type ShopTalisman = {
  entry: CreateItemLibraryEntry;
  perUserLimit: number;
};

const MISSING_TALISMANS: ShopTalisman[] = [
  {
    entry: CreateItemLibraryEntrySchema.parse({
      itemId: 'talisman_identity_reshape',
      type: 'consumable',
      status: 'published',
      payload: {
        name: IDENTITY_RESHAPE_TALISMAN_NAME,
        type: '符箓',
        quality: '神品',
        description:
          '太乙司命所书禁符。催动后可开启身份重塑文戏，依答问与自述改易名姓、性别与人物小传；启封时立即消耗。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: IDENTITY_RESHAPE_SCENARIO,
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: IDENTITY_RESHAPE_SCENARIO,
        sessionMode: 'consume_on_action',
        source: 'missing_talisman_reputation_shop',
      },
    }),
    perUserLimit: 1,
  },
  {
    entry: CreateItemLibraryEntrySchema.parse({
      itemId: 'talisman_sect_meridian_reset',
      type: 'consumable',
      status: 'published',
      payload: {
        name: SECT_MERIDIAN_RESET_TALISMAN_NAME,
        type: '符箓',
        quality: '天品',
        description:
          '以洗脉之力清空当前宗门所有流派节点方案，保留已解锁层数与心法等级，可在背包中直接启封后重新选择节点。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: SECT_MERIDIAN_RESET_TALISMAN_SCENARIO,
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: SECT_MERIDIAN_RESET_TALISMAN_SCENARIO,
        sessionMode: 'consume_on_action',
        source: 'missing_talisman_reputation_shop',
      },
    }),
    perUserLimit: 1,
  },
  {
    entry: CreateItemLibraryEntrySchema.parse({
      itemId: 'talisman_qi_restore_fill_to_max',
      type: 'consumable',
      status: 'published',
      payload: {
        name: '天地引气符',
        type: '符箓',
        quality: '真品',
        description:
          '引天地清气归元，使用后可将灵气恢复至基础上限，受每日符箓使用次数与灵气溢出上限约束。',
        score: 80,
        spec: {
          kind: 'talisman',
          scenario: 'qi_restore_fill_to_max',
          sessionMode: 'consume_on_action',
        },
      },
      editorConfig: {
        kind: 'talisman',
        scenario: 'qi_restore_fill_to_max',
        sessionMode: 'consume_on_action',
        source: 'missing_talisman_reputation_shop',
      },
    }),
    perUserLimit: 3,
  },
];

async function syncLibrary() {
  const itemIds = MISSING_TALISMANS.map((item) => item.entry.itemId);
  const existing = new Map(
    (await findItemLibraryByItemIds(itemIds)).map((entry) => [
      entry.itemId,
      entry,
    ]),
  );
  const results: Array<{ itemId: string; action: 'created' | 'updated' }> = [];

  for (const item of MISSING_TALISMANS) {
    const current = existing.get(item.entry.itemId);
    if (current) {
      await updateItemLibraryEntry({
        id: current.id,
        entry: item.entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      results.push({ itemId: item.entry.itemId, action: 'updated' });
    } else {
      await createItemLibraryEntry({
        entry: item.entry,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      results.push({ itemId: item.entry.itemId, action: 'created' });
    }
  }

  return results;
}

async function syncShop() {
  const existing = new Map(
    (await listReputationShopItems()).map((item) => [
      item.itemLibraryItemId,
      item,
    ]),
  );
  const results: Array<{ itemId: string; action: 'created' | 'updated' }> = [];

  for (const item of MISSING_TALISMANS) {
    const input = {
      itemLibraryItemId: item.entry.itemId,
      price: PRICE,
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
      results.push({ itemId: item.entry.itemId, action: 'updated' });
    } else {
      await createReputationShopItem({
        input,
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
      results.push({ itemId: item.entry.itemId, action: 'created' });
    }
  }

  return results;
}

function validateSchemas() {
  return MISSING_TALISMANS.map((item) => {
    const parsed = consumableSchema.safeParse({
      ...item.entry.payload,
      quantity: 1,
    });
    const payload = parsed.success ? parsed.data : null;
    return {
      itemId: item.entry.itemId,
      name: payload?.name ?? item.entry.itemId,
      scenario:
        payload?.spec?.kind === 'talisman' ? payload.spec.scenario : null,
      schemaOk: parsed.success,
      issues: parsed.success ? [] : parsed.error.issues.slice(0, 3),
    };
  });
}

async function main() {
  const schemaChecks = validateSchemas();
  if (schemaChecks.some((check) => !check.schemaOk)) {
    throw new Error(
      `Schema validation failed: ${JSON.stringify(schemaChecks, null, 2)}`,
    );
  }

  const library = await syncLibrary();
  const shop = await syncShop();

  console.log(
    JSON.stringify(
      {
        price: PRICE,
        schemaChecks,
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
