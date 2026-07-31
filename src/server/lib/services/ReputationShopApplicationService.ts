import type { DbTransaction } from '@server/lib/drizzle/db';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import { buyReputationShopItem } from './ReputationShopService';
import { playerCommandExecutor } from './CommandExecutors';

export function purchaseReputationShopItemCommand(args: {
  id: string;
  userId: string;
  cultivatorId: string;
}) {
  return playerCommandExecutor.executeWithLock({
    userId: args.userId,
    cultivatorId: args.cultivatorId,
    source: 'reputation_shop_buy',
    lock: {
      context: 'reputation-shop-buy',
      timeoutMs: 10_000,
    },
    command: (tx) =>
      executeReputationShopPurchaseCommand({
        ...args,
        tx,
      }),
  });
}

export async function executeReputationShopPurchaseCommand(args: {
  id: string;
  userId: string;
  cultivatorId: string;
  tx: DbTransaction;
}) {
  const purchase = await buyReputationShopItem(args);
  const resourceChanges: ResourceChangeDescriptor[] = [
    {
      resourceTopic: 'player.currency',
      eventType: 'currency.reputation.spent',
      payload: { reputation: purchase.reputation },
      operation: 'merge',
    },
  ];
  for (const change of purchase.settlement.inventoryChanges) {
    resourceChanges.push(
      change.operation === 'upsert'
        ? ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.reputation_shop.rewarded',
            operation: 'upsert-items',
            payload: { idKey: 'id', items: [change.item] },
          } as ResourceChangeDescriptor)
        : ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.reputation_shop.rewarded',
            operation: 'remove-items',
            payload: { idKey: 'id', ids: [change.id] },
          } as ResourceChangeDescriptor),
    );
  }
  return {
    result: {
      purchasedItem: purchase.item,
      reputation: purchase.reputation,
    },
    resourceChanges,
  };
}
