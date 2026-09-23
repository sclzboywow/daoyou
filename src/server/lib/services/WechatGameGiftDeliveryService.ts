import { authAccounts } from '@server/lib/auth/schema';
import { db } from '@server/lib/drizzle/db';
import { cultivators, mails } from '@server/lib/drizzle/schema';
import { findPublishedItemLibraryByItemIds } from '@server/lib/repositories/itemLibraryRepository';
import { MailService } from '@server/lib/services/MailService';
import { buildAttachmentFromItemLibraryEntry } from '@shared/lib/itemLibrary';
import { and, eq, sql } from 'drizzle-orm';
import { publishTransactionalMessageBestEffort } from '@server/lib/mq/transactionalMessagePublisher';

export type WechatGameGiftPayload = {
  orderId: string;
  toUserOpenid: string;
  isPreview?: boolean;
  goods: Array<{ id: string; quantity: number }>;
};

function appId() {
  const value = process.env.WECHAT_MINI_GAME_APP_ID?.trim();
  if (!value) throw new Error('微信小游戏 AppID 尚未配置');
  return value;
}

export async function deliverWechatGameGift(payload: WechatGameGiftPayload) {
  if (!payload.orderId || !payload.toUserOpenid || payload.goods.length === 0) {
    throw new Error('小游戏礼包消息字段不完整');
  }
  if (payload.isPreview) {
    const previewEntries = await findPublishedItemLibraryByItemIds(
      payload.goods
        .filter((item) => item.id !== 'spirit_stones')
        .map((item) => item.id),
    );
    const previewEntryMap = new Map(
      previewEntries.map((entry) => [entry.itemId, entry]),
    );
    for (const item of payload.goods) {
      if (item.id !== 'spirit_stones' && !previewEntryMap.has(item.id)) {
        throw new Error(`礼包道具未配置或已下架：${item.id}`);
      }
    }
    return { duplicate: false, preview: true };
  }
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
      and(eq(cultivators.userId, account.userId), eq(cultivators.status, 'active')),
    )
    .limit(1);
  if (!cultivator) throw new Error('礼包接收玩家没有 active 角色');

  const itemEntries = await findPublishedItemLibraryByItemIds(
    payload.goods
      .filter((item) => item.id !== 'spirit_stones')
      .map((item) => item.id),
  );
  const entryMap = new Map(itemEntries.map((entry) => [entry.itemId, entry]));
  const attachments = payload.goods.map((item) => {
    if (item.id === 'spirit_stones') {
      return {
        type: 'spirit_stones' as const,
        name: '灵石',
        quantity: item.quantity,
      };
    }
    const entry = entryMap.get(item.id);
    if (!entry) throw new Error(`礼包道具未配置或已下架：${item.id}`);
    return buildAttachmentFromItemLibraryEntry(entry, item.quantity);
  });
  const deduplicationKey = `wechat-game-gift:${payload.orderId}`;

  const created = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${deduplicationKey}))`);
    const [existing] = await tx
      .select({ id: mails.id })
      .from(mails)
      .where(eq(mails.deduplicationKey, deduplicationKey))
      .limit(1);
    if (existing) return null;
    return MailService.sendMail(
      cultivator.id,
      '微信小游戏礼包到账',
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
