import { db } from '@server/lib/drizzle/db';
import { findPublishedItemLibraryByItemIds } from '@server/lib/repositories/itemLibraryRepository';
import { ITEM_LIBRARY_SYSTEM_USER_ID } from '@server/lib/services/MaterialLibraryService';
import {
  createSectShopItem,
  listSectShopItems,
} from '@server/lib/services/SectShopService';

const OFFICIAL_SECT_SHOP_CATALOG = [
  { itemLibraryItemId: 'talisman_qi_restore_small', price: 20, perUserLimit: 5 },
  { itemLibraryItemId: 'talisman_qi_restore_medium', price: 40, perUserLimit: 3 },
  { itemLibraryItemId: 'talisman_qi_restore_large', price: 80, perUserLimit: 1 },
  { itemLibraryItemId: 'pill_jiedu_01', price: 15, perUserLimit: 3 },
  { itemLibraryItemId: 'pill_jiedu_02', price: 30, perUserLimit: 2 },
  { itemLibraryItemId: 'pill_qx_001', price: 45, perUserLimit: 1 },
  { itemLibraryItemId: 'pill_life_incr_01', price: 60, perUserLimit: 1 },
  { itemLibraryItemId: 'pill_life_incr_02', price: 120, perUserLimit: 1 },
  { itemLibraryItemId: 'fulu_chat_01', price: 20, perUserLimit: 3 },
  { itemLibraryItemId: 'talisman_draw_gongfa', price: 100, perUserLimit: 1 },
  { itemLibraryItemId: 'talisman_draw_skill', price: 100, perUserLimit: 1 },
  { itemLibraryItemId: 'talisman_reshape_fate', price: 180, perUserLimit: 1 },
  { itemLibraryItemId: 'fu_reset_all_attr', price: 220, perUserLimit: 1 },
] as const;

async function main() {
  const apply = process.argv.includes('--apply');
  const itemIds = OFFICIAL_SECT_SHOP_CATALOG.map(
    (entry) => entry.itemLibraryItemId,
  );
  const [existingItems, publishedItems] = await Promise.all([
    listSectShopItems(),
    findPublishedItemLibraryByItemIds(itemIds),
  ]);
  const existingIds = new Set(
    existingItems.map((entry) => entry.itemLibraryItemId),
  );
  const publishedIds = new Set(publishedItems.map((entry) => entry.itemId));
  const unavailableIds = itemIds.filter((itemId) => !publishedIds.has(itemId));

  if (unavailableIds.length > 0) {
    throw new Error(
      `宗门宝库官方道具尚未发布：${unavailableIds.join(', ')}`,
    );
  }

  const missingEntries = OFFICIAL_SECT_SHOP_CATALOG.filter(
    (entry) => !existingIds.has(entry.itemLibraryItemId),
  );

  if (apply) {
    for (const [index, entry] of missingEntries.entries()) {
      await createSectShopItem({
        input: {
          ...entry,
          quantity: 1,
          status: 'active',
          sortOrder: 100 + index * 10,
        },
        userId: ITEM_LIBRARY_SYSTEM_USER_ID,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        officialCatalogSize: OFFICIAL_SECT_SHOP_CATALOG.length,
        existingCount: OFFICIAL_SECT_SHOP_CATALOG.length - missingEntries.length,
        createdCount: apply ? missingEntries.length : 0,
        pendingItemIds: missingEntries.map((entry) => entry.itemLibraryItemId),
      },
      null,
      2,
    ),
  );

  await db.$client.end();
}

await main();
