import type { ItemLibraryEntry } from '@shared/lib/itemLibrary';
import { ItemLibraryItemIdSchema } from '@shared/lib/itemLibrary';
import { z } from 'zod';

export const ItemExchangeShopItemStatusSchema = z.enum([
  'active',
  'archived',
]);

export const ITEM_EXCHANGE_SHOP_MAX_PRICE = 9999;
export const ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY = 30;

export const ItemExchangeShopItemMutationSchema = z.object({
  itemLibraryItemId: ItemLibraryItemIdSchema,
  price: z
    .number()
    .int()
    .min(1)
    .max(ITEM_EXCHANGE_SHOP_MAX_PRICE),
  quantity: z
    .number()
    .int()
    .min(1)
    .max(ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY),
  perUserLimit: z.number().int().min(1).max(100000000).nullable().optional(),
  status: ItemExchangeShopItemStatusSchema.default('active'),
  sortOrder: z.number().int().min(-1000000).max(1000000).default(0),
});

export type ItemExchangeShopItemStatus = z.infer<
  typeof ItemExchangeShopItemStatusSchema
>;
export type ItemExchangeShopItemMutation = z.infer<
  typeof ItemExchangeShopItemMutationSchema
>;

export interface ItemExchangeShopItemView {
  id: string;
  itemLibraryItemId: string;
  price: number;
  quantity: number;
  perUserLimit: number | null;
  status: ItemExchangeShopItemStatus;
  sortOrder: number;
  purchasedCount: number;
  remainingPurchases: number | null;
  item: ItemLibraryEntry;
  createdAt: string;
  updatedAt: string;
}
