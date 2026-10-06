import { authAccounts } from '@server/lib/auth/schema';
import { db } from '@server/lib/drizzle/db';
import { cultivators, mails } from '@server/lib/drizzle/schema';
import { publishTransactionalMessageBestEffort } from '@server/lib/mq/transactionalMessagePublisher';
import { findPublishedItemLibraryByItemIds } from '@server/lib/repositories/itemLibraryRepository';
import { MailService } from '@server/lib/services/MailService';
import type { ItemLibraryEntry } from '@shared/lib/itemLibrary';
import type { MailAttachment } from '@shared/types/mail';
import { and, eq, sql } from 'drizzle-orm';
import { newRewardAttachment } from './MailInventory';

import { WECHAT_GAME_GIFTS } from '@shared/config/wechatGameGifts';
import { wechatGiftAttachment } from '@shared/wechat/giftRewards';
import type { WechatGameGiftPayload } from '@shared/wechat/messagePush';

function buildGiftAttachment(
  entry: ItemLibraryEntry,
  quantity: number,
): MailAttachment {
  if (entry.type === 'artifact') throw new Error('旧器物奖励不支持新礼包发放');
  return newRewardAttachment({
    type: entry.type,
    name: entry.payload.name,
    quantity,
    data: { ...entry.payload, quantity } as MailAttachment['data'],
  });
}

function appId() {
  const value = process.env.WECHAT_MINI_GAME_APP_ID?.trim();
  if (!value) throw new Error('微信小游戏 AppID 尚未配置');
  return value;
}

export async function deliverWechatGameGift(payload: WechatGameGiftPayload) {
  if (!payload.orderId || !payload.toUserOpenid || payload.goods.length === 0) {
    throw new Error('小游戏礼包消息字段不完整');
  }
  const configuredGift = WECHAT_GAME_GIFTS.find(
    (gift) => gift.id === payload.giftId,
  );
  if (!configuredGift && !(payload.isPreview && !payload.giftId))
    throw new Error('小游戏礼包未配置');
  if (payload.isPreview) {
    const previewEntries = await findPublishedItemLibraryByItemIds(
      payload.goods
        .filter(
          (item) =>
            item.id !== 'spirit_stones' &&
            !wechatGiftAttachment(item.id, item.quantity),
        )
        .map((item) => item.id),
    );
    const previewEntryMap = new Map(
      previewEntries.map((entry) => [entry.itemId, entry]),
    );
    for (const item of payload.goods) {
      if (wechatGiftAttachment(item.id, item.quantity)) continue;
      const entry = previewEntryMap.get(item.id);
      if (entry) buildGiftAttachment(entry, item.quantity);
      if (item.id !== 'spirit_stones' && !entry) {
        throw new Error(`礼包道具未配置或已下架：${item.id}`);
      }
    }
    return { duplicate: false, preview: true };
  }
  const deduplicationKey = `wechat-game-gift:${payload.orderId}`;
  const [receipt] = await db
    .select({ id: mails.id })
    .from(mails)
    .where(eq(mails.deduplicationKey, deduplicationKey))
    .limit(1);
  if (receipt) return { duplicate: true };
  const accountId = `${appId()}:${payload.toUserOpenid}`;
  const [account] = await db
    .select({ userId: authAccounts.userId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.providerId, 'wechat-mini-game'),
        eq(authAccounts.accountId, accountId),
      ),
    )
    .limit(1);
  if (!account) throw new Error('礼包接收玩家尚未登录游戏');

  const [cultivator] = await db
    .select({ id: cultivators.id })
    .from(cultivators)
    .where(
      and(
        eq(cultivators.userId, account.userId),
        eq(cultivators.status, 'active'),
      ),
    )
    .limit(1);
  if (!cultivator) throw new Error('礼包接收玩家没有 active 角色');

  const itemEntries = await findPublishedItemLibraryByItemIds(
    payload.goods
      .filter(
        (item) =>
          item.id !== 'spirit_stones' &&
          !wechatGiftAttachment(item.id, item.quantity),
      )
      .map((item) => item.id),
  );
  const entryMap = new Map(itemEntries.map((entry) => [entry.itemId, entry]));
  const attachments = payload.goods.map((item) => {
    const current = wechatGiftAttachment(item.id, item.quantity);
    if (current) return current;
    if (item.id === 'spirit_stones') {
      return {
        type: 'spirit_stones' as const,
        name: '灵石',
        quantity: item.quantity,
      };
    }
    const entry = entryMap.get(item.id);
    if (!entry) throw new Error(`礼包道具未配置或已下架：${item.id}`);
    return buildGiftAttachment(entry, item.quantity);
  });
  const created = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${deduplicationKey}))`,
    );
    const [existing] = await tx
      .select({ id: mails.id })
      .from(mails)
      .where(eq(mails.deduplicationKey, deduplicationKey))
      .limit(1);
    if (existing) return null;
    return MailService.sendMail(
      cultivator.id,
      configuredGift?.name ?? '微信小游戏礼包到账',
      '微信礼包已发放，请在传音玉简中领取附件。',
      attachments,
      'reward',
      tx,
      deduplicationKey,
    );
  });
  if (created) {
    publishTransactionalMessageBestEffort(created.domainEventId, {
      source: 'wechat_game_gift',
      cultivatorId: cultivator.id,
      mailId: created.id,
    });
  }
  return { duplicate: !created };
}
