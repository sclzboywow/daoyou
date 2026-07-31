import {
  ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY,
} from '@shared/contracts/itemExchangeShop';
import type { ItemLibraryEntry } from '@shared/lib/itemLibrary';

const PURCHASE_WEEK_TIME_ZONE = 'Asia/Shanghai';

export function getItemExchangePurchaseWeek(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: PURCHASE_WEEK_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  const localDate = new Date(
    Date.UTC(Number(value.year), Number(value.month) - 1, Number(value.day)),
  );
  const dayOffset = (localDate.getUTCDay() + 6) % 7;
  localDate.setUTCDate(localDate.getUTCDate() - dayOffset);
  return localDate.toISOString().slice(0, 10);
}

export function getItemExchangeQuantityError(args: {
  itemType: ItemLibraryEntry['type'] | string;
  quantity: number;
}): string | null {
  if (!Number.isInteger(args.quantity) || args.quantity < 1) {
    return '商品发放数量配置异常';
  }
  if (args.itemType === 'artifact' && args.quantity !== 1) {
    return '法宝类商品每次只能发放 1 件';
  }
  if (
    args.itemType !== 'artifact' &&
    args.quantity > ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY
  ) {
    return `材料和消耗品每次最多发放 ${ITEM_EXCHANGE_SHOP_MAX_STACK_QUANTITY} 件`;
  }
  return null;
}
