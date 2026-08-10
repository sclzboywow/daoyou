import type { DbTransaction } from '@server/lib/drizzle/db';
import { cultivators, mails } from '@server/lib/drizzle/schema';
import { redisLockKeys, withRedisLock } from '@server/lib/redis/lock';
import { getPlayerLoadoutByCultivatorId } from '@server/lib/services/cultivator/CultivatorLoadoutReader';
import type { ResourceChangeDescriptor } from '@shared/contracts/resources';
import { and, eq, sql } from 'drizzle-orm';
import {
  buyItem,
  cancelListing,
  clearAuctionListingsCache,
  listItem,
} from './AuctionService';
import { playerCommandExecutor } from './CommandExecutors';
import { readCultivatorName } from './cultivator/CultivatorFactsReader';

export async function executeAuctionBuyCommand(args: {
  listingId: string;
  quantity: number;
  buyerCultivatorId: string;
  buyerCultivatorName: string;
  tx: DbTransaction;
}) {
  await buyItem(
    {
      listingId: args.listingId,
      quantity: args.quantity,
      buyerCultivatorId: args.buyerCultivatorId,
      buyerCultivatorName: args.buyerCultivatorName,
    },
    { tx: args.tx, deferCacheClear: true },
  );
  const [currency] = await args.tx
    .select({ spiritStones: cultivators.spirit_stones })
    .from(cultivators)
    .where(eq(cultivators.id, args.buyerCultivatorId))
    .limit(1);
  const [mailSummary] = await args.tx
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(mails)
    .where(
      and(
        eq(mails.cultivatorId, args.buyerCultivatorId),
        eq(mails.isRead, false),
      ),
    );
  if (!currency) throw new Error('拍卖结算后角色不存在');
  return {
    result: { message: '成功购入物品，请查收邮件' },
    resourceChanges: [
      {
        resourceTopic: 'player.currency',
        eventType: 'currency.auction.spent',
        operation: 'merge',
        payload: { spiritStones: currency.spiritStones },
      },
      {
        resourceTopic: 'player.mail-summary',
        eventType: 'mail.auction.purchase.created',
        operation: 'merge',
        payload: { unreadCount: Number(mailSummary?.unreadCount ?? 0) },
      },
    ] satisfies ResourceChangeDescriptor[],
  };
}

export async function executeAuctionListCommand(
  args: Parameters<typeof listItem>[0] & { tx: DbTransaction },
) {
  const { tx, ...input } = args;
  const listed = await listItem(input, { tx, deferCacheClear: true });
  const resourceChanges: ResourceChangeDescriptor[] =
    listed.inventoryChanges.map((change) =>
      change.operation === 'upsert'
        ? ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.auction.listed',
            operation: 'upsert-items',
            payload: { idKey: 'id', items: [change.item] },
          } as ResourceChangeDescriptor)
        : ({
            resourceTopic: `inventory.${change.kind}`,
            eventType: 'inventory.auction.listed',
            operation: 'remove-items',
            payload: { idKey: 'id', ids: [change.id] },
          } as ResourceChangeDescriptor),
    );
  if (input.itemType === 'artifact') {
    const loadout = await getPlayerLoadoutByCultivatorId(
      input.cultivatorId,
      tx,
    );
    resourceChanges.push({
      resourceTopic: 'player.loadout',
      eventType: 'loadout.auction.listed',
      operation: 'replace',
      payload: loadout,
    });
  }
  return { result: listed.result, resourceChanges };
}

export async function executeAuctionCancelCommand(args: {
  listingId: string;
  cultivatorId: string;
  tx: DbTransaction;
}) {
  await cancelListing(args.listingId, args.cultivatorId, {
    tx: args.tx,
    deferCacheClear: true,
  });
  const [mailSummary] = await args.tx
    .select({ unreadCount: sql<number>`count(*)::int` })
    .from(mails)
    .where(
      and(eq(mails.cultivatorId, args.cultivatorId), eq(mails.isRead, false)),
    );
  return {
    result: { message: '物品已下架，将通过邮件返还' },
    resourceChanges: [
      {
        resourceTopic: 'player.mail-summary',
        eventType: 'mail.auction.cancel.created',
        operation: 'merge',
        payload: { unreadCount: Number(mailSummary?.unreadCount ?? 0) },
      },
    ] satisfies ResourceChangeDescriptor[],
  };
}

type AuctionActor = {
  userId: string;
  cultivatorId: string;
};

export async function buyAuctionListing(args: {
  actor: AuctionActor;
  listingId: string;
  quantity: number;
  requestId: string;
}) {
  const committed = await withRedisLock(
    {
      keys: [
        redisLockKeys.auctionListing(args.listingId),
        redisLockKeys.cultivatorMutation(args.actor.cultivatorId),
      ],
      context: 'auction-buy',
      timeoutMs: 10_000,
      retries: 0,
    },
    (lease) =>
      playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: args.actor.userId,
        cultivatorId: args.actor.cultivatorId,
        source: 'auction_buy',
        idempotency: {
          key: `auction-buy:${args.listingId}:${args.requestId}`,
          fingerprint: `${args.actor.cultivatorId}:${args.listingId}:${args.quantity}`,
        },
        command: async (tx) => {
          const { name } = await readCultivatorName(
            args.actor.cultivatorId,
            tx,
          );
          return executeAuctionBuyCommand({
            listingId: args.listingId,
            quantity: args.quantity,
            buyerCultivatorId: args.actor.cultivatorId,
            buyerCultivatorName: name,
            tx,
          });
        },
      }),
  );
  await clearAuctionListingsCache();
  return committed;
}

export async function listAuctionItem(args: {
  actor: AuctionActor;
  itemType: 'material' | 'artifact' | 'consumable';
  itemId: string;
  price: number;
  quantity: number;
  visibility: 'public' | 'private';
  targetCultivatorId?: string;
}) {
  const committed = await playerCommandExecutor.executeWithLock({
    userId: args.actor.userId,
    cultivatorId: args.actor.cultivatorId,
    source: 'auction_list',
    lock: {
      context: 'auction-list',
      timeoutMs: 10_000,
    },
    command: async (tx) => {
      const { name } = await readCultivatorName(args.actor.cultivatorId, tx);
      return executeAuctionListCommand({
        userId: args.actor.userId,
        cultivatorId: args.actor.cultivatorId,
        cultivatorName: name,
        itemType: args.itemType,
        itemId: args.itemId,
        price: args.price,
        quantity: args.quantity,
        visibility: args.visibility,
        targetCultivatorId: args.targetCultivatorId,
        tx,
      });
    },
  });
  await clearAuctionListingsCache();
  return committed;
}

export async function cancelAuctionListing(args: {
  actor: AuctionActor;
  listingId: string;
}) {
  const committed = await withRedisLock(
    {
      keys: [
        redisLockKeys.auctionListing(args.listingId),
        redisLockKeys.cultivatorMutation(args.actor.cultivatorId),
      ],
      context: 'auction-cancel',
      timeoutMs: 10_000,
      retries: 0,
    },
    (lease) =>
      playerCommandExecutor.execute({
        coordination: { mode: 'redis', lease },
        userId: args.actor.userId,
        cultivatorId: args.actor.cultivatorId,
        source: 'auction_cancel',
        idempotency: {
          key: `auction-cancel:${args.listingId}`,
          fingerprint: `${args.actor.cultivatorId}:${args.listingId}`,
        },
        command: (tx) =>
          executeAuctionCancelCommand({
            listingId: args.listingId,
            cultivatorId: args.actor.cultivatorId,
            tx,
          }),
      }),
  );
  await clearAuctionListingsCache();
  return committed;
}
