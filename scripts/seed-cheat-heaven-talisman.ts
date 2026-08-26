/**
 * Upsert 欺天符 into item library + reputation shop (350 reputation).
 *
 * Usage:
 *   DATABASE_URL=... bun run scripts/seed-cheat-heaven-talisman.ts
 */
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
  CHEAT_HEAVEN_TALISMAN_NAME,
  CHEAT_HEAVEN_TALISMAN_SCENARIO,
} from '@shared/config/sectTransferTalisman';
import { CreateItemLibraryEntrySchema } from '@shared/lib/itemLibrary';

const ITEM_ID = 'talisman_sect_transfer';
const PRICE = 350;
const PER_USER_LIMIT = 1;

const entry = CreateItemLibraryEntrySchema.parse({
  itemId: ITEM_ID,
  type: 'consumable',
  status: 'published',
  payload: {
    name: CHEAT_HEAVEN_TALISMAN_NAME,
    type: '符箓',
    quality: '神品',
    description:
      '以欺瞒天道名录为核心的一纸禁符。催动后可无损改写当前宗门归属：六本心法等级保留，双道途解锁层数可顺承或对调，目标宗门节点与神通需重新选择。确认转宗成功后才会消耗。',
    score: 120,
    spec: {
      kind: 'talisman',
      scenario: CHEAT_HEAVEN_TALISMAN_SCENARIO,
      sessionMode: 'consume_on_action',
    },
  },
  editorConfig: {
    kind: 'talisman',
    scenario: CHEAT_HEAVEN_TALISMAN_SCENARIO,
    sessionMode: 'consume_on_action',
    source: 'cheat_heaven_talisman_seed',
  },
});

async function main() {
  const existing = await findItemLibraryByItemIds([ITEM_ID]);
  const current = existing[0];
  if (current) {
    await updateItemLibraryEntry({
      id: current.id,
      entry,
      userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    });
  } else {
    await createItemLibraryEntry({
      entry,
      userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    });
  }

  const shopItems = await listReputationShopItems();
  const shopCurrent = shopItems.find(
    (item) => item.itemLibraryItemId === ITEM_ID,
  );
  const shopInput = {
    itemLibraryItemId: ITEM_ID,
    price: PRICE,
    quantity: 1,
    perUserLimit: PER_USER_LIMIT,
    status: 'active' as const,
    sortOrder: 0,
  };
  if (shopCurrent) {
    await updateReputationShopItem({
      id: shopCurrent.id,
      input: shopInput,
      userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    });
  } else {
    await createReputationShopItem({
      input: shopInput,
      userId: ITEM_LIBRARY_SYSTEM_USER_ID,
    });
  }

  console.log(
    JSON.stringify(
      {
        itemId: ITEM_ID,
        name: CHEAT_HEAVEN_TALISMAN_NAME,
        scenario: CHEAT_HEAVEN_TALISMAN_SCENARIO,
        library: current ? 'updated' : 'created',
        shop: shopCurrent ? 'updated' : 'created',
        price: PRICE,
        perUserLimit: PER_USER_LIMIT,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
