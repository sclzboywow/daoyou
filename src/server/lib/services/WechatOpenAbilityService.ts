import { findWechatMiniGameOpenId } from '@server/lib/auth/wechatMiniGameIdentity';
import { db, getExecutor, type DbTransaction } from '@server/lib/drizzle/db';
import {
  cultivators,
  wechatShareGiftClaims,
  wechatShareGifts,
  wechatSubscriptionIntents,
} from '@server/lib/drizzle/schema';
import { findPublishedItemLibraryByItemIds } from '@server/lib/repositories/itemLibraryRepository';
import { MailService } from '@server/lib/services/MailService';
import { QiService } from '@server/lib/services/QiService';
import {
  sendWechatMiniGameSubscribeMessage,
  WechatMiniGameApiError,
} from '@server/lib/wechat/miniGameApi';
import {
  QI_MAX,
  QI_NATURAL_RESTORE_INTERVAL_MS,
  QI_NATURAL_RESTORE_PER_HOUR,
} from '@shared/config/qiSystem';
import { buildAttachmentFromItemLibraryEntry } from '@shared/lib/itemLibrary';
import type { MailAttachment } from '@shared/types/mail';
import { and, asc, eq, gte, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

const subscribeTemplateDataSchema = z.record(
  z.string().min(1),
  z.object({ value: z.string().max(20) }).strict(),
);

const QI_INTENT_KIND = 'qi_full' as const;
const GIFT_KIND = 'fate_blessing' as const;
const SHARE_GIFT_REWARD_ITEM_ID = 'talisman_qi_restore_medium';
const SHARE_GIFT_REWARD_ITEM_NAME = '中聚灵符';
const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_SENDING_MS = 10 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60_000;

export type WechatOpenAbilityActor = {
  userId: string;
  cultivatorId: string;
};

export class WechatOpenAbilityError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409 | 503 = 400,
    readonly code = 'WECHAT_OPEN_ABILITY_ERROR',
  ) {
    super(message);
  }
}

function parsePositiveInt(raw: string | undefined, fallback: number): number {
  const value = Number.parseInt(raw ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getConfig() {
  const qiTemplateId = process.env.WECHAT_QI_FULL_SUBSCRIBE_TEMPLATE_ID?.trim() || '';
  const rawData = process.env.WECHAT_QI_FULL_SUBSCRIBE_DATA_JSON?.trim() || '';
  let qiTemplateData: Record<string, { value: string }> | null = null;
  if (rawData) {
    try {
      const parsed = subscribeTemplateDataSchema.safeParse(JSON.parse(rawData));
      if (parsed.success) qiTemplateData = parsed.data;
    } catch {
      qiTemplateData = null;
    }
  }
  const wechatConfigured = Boolean(
    process.env.WECHAT_MINI_GAME_APP_ID?.trim() &&
      process.env.WECHAT_MINI_GAME_APP_SECRET?.trim(),
  );
  return {
    wechatConfigured,
    qi: {
      enabled: wechatConfigured && Boolean(qiTemplateId) && Boolean(qiTemplateData),
      templateId: qiTemplateId,
      templateData: qiTemplateData,
      page: process.env.WECHAT_QI_FULL_SUBSCRIBE_PAGE?.trim() || undefined,
    },
    shareGift: {
      enabled: process.env.WECHAT_SHARE_GIFT_ENABLED === 'true',
      expiresHours: parsePositiveInt(process.env.WECHAT_SHARE_GIFT_EXPIRES_HOURS, 24),
      dailyCreateLimit: parsePositiveInt(process.env.WECHAT_SHARE_GIFT_DAILY_CREATE_LIMIT, 5),
      dailyClaimLimit: parsePositiveInt(process.env.WECHAT_SHARE_GIFT_DAILY_CLAIM_LIMIT, 3),
      rewardSpiritStones: parsePositiveInt(
        process.env.WECHAT_SHARE_GIFT_REWARD_SPIRIT_STONES,
        30_000,
      ),
    },
  };
}

function startOfShanghaiDay(date = new Date()): Date {
  const shifted = new Date(date.getTime() + SHANGHAI_OFFSET_MS);
  return new Date(
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate(),
    ) - SHANGHAI_OFFSET_MS,
  );
}

function renderTemplateData(
  template: Record<string, { value: string }>,
  variables: Record<string, string>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(template).map(([key, entry]) => [
      key,
      {
        value: entry.value.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (_, name: string) =>
          variables[name] ?? '',
        ),
      },
    ]),
  );
}

async function readProjectedQi(
  cultivatorId: string,
  tx?: DbTransaction,
): Promise<{
  current: number;
  targetAt: Date | null;
  cultivatorName: string;
}> {
  const [row] = await getExecutor(tx)
    .select({
      name: cultivators.name,
      qi: cultivators.qi,
      qiLastRefreshedAt: cultivators.qiLastRefreshedAt,
    })
    .from(cultivators)
    .where(eq(cultivators.id, cultivatorId))
    .limit(1);
  if (!row) {
    throw new WechatOpenAbilityError('角色不存在', 404, 'CULTIVATOR_NOT_FOUND');
  }

  const projection = QiService.calculateNaturalQiState({
    qi: row.qi,
    qiLastRefreshedAt: row.qiLastRefreshedAt,
  });
  if (projection.qi >= QI_MAX) {
    return { current: projection.qi, targetAt: null, cultivatorName: row.name };
  }
  const restoreSteps = Math.ceil(
    (QI_MAX - projection.qi) / QI_NATURAL_RESTORE_PER_HOUR,
  );
  const baseline = projection.qiLastRefreshedAt ?? new Date();
  return {
    current: projection.qi,
    targetAt: new Date(
      baseline.getTime() + restoreSteps * QI_NATURAL_RESTORE_INTERVAL_MS,
    ),
    cultivatorName: row.name,
  };
}

function shareGiftReward(config = getConfig()) {
  return {
    spiritStones: config.shareGift.rewardSpiritStones,
    items: [
      {
        itemId: SHARE_GIFT_REWARD_ITEM_ID,
        name: SHARE_GIFT_REWARD_ITEM_NAME,
        quantity: 1,
      },
    ],
  };
}

async function buildShareGiftRewardAttachments(
  config: ReturnType<typeof getConfig>,
  tx: DbTransaction,
): Promise<MailAttachment[]> {
  const reward = shareGiftReward(config);
  const [rewardItem] = await findPublishedItemLibraryByItemIds(
    [SHARE_GIFT_REWARD_ITEM_ID],
    tx,
  );
  if (!rewardItem) {
    throw new WechatOpenAbilityError(
      '分享机缘奖励道具尚未配置',
      503,
      'SHARE_GIFT_REWARD_ITEM_UNAVAILABLE',
    );
  }
  return [
    { type: 'spirit_stones', name: '灵石', quantity: reward.spiritStones },
    buildAttachmentFromItemLibraryEntry(rewardItem, 1),
  ];
}

export async function getWechatOpenAbilities(actor: WechatOpenAbilityActor) {
  const config = getConfig();
  const [openId, pendingIntent] = await Promise.all([
    findWechatMiniGameOpenId(actor.userId),
    getExecutor()
      .select({
        id: wechatSubscriptionIntents.id,
        status: wechatSubscriptionIntents.status,
        targetAt: wechatSubscriptionIntents.targetAt,
      })
      .from(wechatSubscriptionIntents)
      .where(
        and(
          eq(wechatSubscriptionIntents.cultivatorId, actor.cultivatorId),
          eq(wechatSubscriptionIntents.kind, QI_INTENT_KIND),
          eq(wechatSubscriptionIntents.status, 'pending'),
        ),
      )
      .limit(1),
  ]);
  const qi = await readProjectedQi(actor.cultivatorId);
  return {
    wechatLinked: Boolean(openId),
    subscription: {
      qiFull: {
        enabled: config.qi.enabled && Boolean(openId),
        templateId: config.qi.enabled ? config.qi.templateId : '',
        currentQi: qi.current,
        maxQi: QI_MAX,
        pending: pendingIntent[0]
          ? {
              id: pendingIntent[0].id,
              status: pendingIntent[0].status,
              targetAt: pendingIntent[0].targetAt.toISOString(),
            }
          : null,
      },
    },
    shareGift: {
      enabled: config.shareGift.enabled,
      expiresHours: config.shareGift.expiresHours,
      dailyCreateLimit: config.shareGift.dailyCreateLimit,
      dailyClaimLimit: config.shareGift.dailyClaimLimit,
      reward: shareGiftReward(config),
    },
  };
}

export async function subscribeQiFullReminder(input: {
  actor: WechatOpenAbilityActor;
  templateId: string;
}) {
  const config = getConfig();
  if (!config.qi.enabled) {
    throw new WechatOpenAbilityError(
      '灵气订阅提醒尚未配置',
      503,
      'QI_SUBSCRIBE_NOT_CONFIGURED',
    );
  }
  if (input.templateId !== config.qi.templateId) {
    throw new WechatOpenAbilityError('订阅模板已更新，请重试', 409, 'TEMPLATE_CHANGED');
  }
  const openId = await findWechatMiniGameOpenId(input.actor.userId);
  if (!openId) {
    throw new WechatOpenAbilityError(
      '当前账号未绑定微信小游戏身份',
      403,
      'WECHAT_IDENTITY_REQUIRED',
    );
  }

  return db.transaction(async (tx) => {
    const [lockedCultivator] = await tx
      .select({ id: cultivators.id })
      .from(cultivators)
      .where(eq(cultivators.id, input.actor.cultivatorId))
      .for('update')
      .limit(1);
    if (!lockedCultivator) {
      throw new WechatOpenAbilityError('角色不存在', 404, 'CULTIVATOR_NOT_FOUND');
    }
    const qi = await readProjectedQi(input.actor.cultivatorId, tx);
    if (!qi.targetAt) {
      throw new WechatOpenAbilityError(
        '当前天地灵气已充盈，无需设置提醒',
        409,
        'QI_ALREADY_FULL',
      );
    }

    await tx
      .update(wechatSubscriptionIntents)
      .set({
        status: 'cancelled',
        failureCode: 'REPLACED',
        failureMessage: '玩家重新授权了同类订阅提醒',
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(wechatSubscriptionIntents.cultivatorId, input.actor.cultivatorId),
          eq(wechatSubscriptionIntents.kind, QI_INTENT_KIND),
          sql`${wechatSubscriptionIntents.status} IN ('pending', 'sending')`,
        ),
      );

    const [intent] = await tx
      .insert(wechatSubscriptionIntents)
      .values({
        userId: input.actor.userId,
        cultivatorId: input.actor.cultivatorId,
        kind: QI_INTENT_KIND,
        templateId: config.qi.templateId,
        targetAt: qi.targetAt,
        status: 'pending',
      })
      .returning({
        id: wechatSubscriptionIntents.id,
        targetAt: wechatSubscriptionIntents.targetAt,
      });
    if (!intent) throw new Error('订阅提醒创建失败');
    return {
      id: intent.id,
      targetAt: intent.targetAt.toISOString(),
      currentQi: qi.current,
      maxQi: QI_MAX,
    };
  });
}

export async function createWechatShareGift(actor: WechatOpenAbilityActor) {
  const config = getConfig();
  if (!config.shareGift.enabled) {
    throw new WechatOpenAbilityError('赠予机缘尚未开启', 503, 'SHARE_GIFT_DISABLED');
  }
  const now = new Date();
  const dayStart = startOfShanghaiDay(now);
  return db.transaction(async (tx) => {
    const [sender] = await tx
      .select({ id: cultivators.id, name: cultivators.name })
      .from(cultivators)
      .where(eq(cultivators.id, actor.cultivatorId))
      .for('update')
      .limit(1);
    if (!sender) {
      throw new WechatOpenAbilityError('角色不存在', 404, 'CULTIVATOR_NOT_FOUND');
    }
    const [countRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(wechatShareGifts)
      .where(
        and(
          eq(wechatShareGifts.senderCultivatorId, actor.cultivatorId),
          gte(wechatShareGifts.createdAt, dayStart),
        ),
      );
    if (Number(countRow?.total ?? 0) >= config.shareGift.dailyCreateLimit) {
      throw new WechatOpenAbilityError(
        '今日可赠出的机缘已达上限',
        409,
        'SHARE_GIFT_DAILY_LIMIT',
      );
    }

    const expiresAt = new Date(
      now.getTime() + config.shareGift.expiresHours * 60 * 60_000,
    );
    const [gift] = await tx
      .insert(wechatShareGifts)
      .values({
        senderUserId: actor.userId,
        senderCultivatorId: actor.cultivatorId,
        senderName: sender.name,
        kind: GIFT_KIND,
        status: 'active',
        maxClaims: 1,
        claimedCount: 0,
        expiresAt,
      })
      .returning({ id: wechatShareGifts.id });
    if (!gift) throw new Error('机缘创建失败');
    return {
      id: gift.id,
      title: `${sender.name}赠你一缕机缘`,
      query: `gift=${encodeURIComponent(gift.id)}`,
      expiresAt: expiresAt.toISOString(),
      reward: shareGiftReward(config),
    };
  });
}

async function expireGiftIfNeeded(giftId: string, tx?: DbTransaction): Promise<void> {
  const now = new Date();
  await getExecutor(tx)
    .update(wechatShareGifts)
    .set({ status: 'expired', updatedAt: now })
    .where(
      and(
        eq(wechatShareGifts.id, giftId),
        eq(wechatShareGifts.status, 'active'),
        lte(wechatShareGifts.expiresAt, now),
      ),
    );
}

export async function getWechatShareGiftPreview(
  actor: WechatOpenAbilityActor,
  giftId: string,
) {
  await expireGiftIfNeeded(giftId);
  const [gift] = await getExecutor()
    .select()
    .from(wechatShareGifts)
    .where(eq(wechatShareGifts.id, giftId))
    .limit(1);
  if (!gift) {
    throw new WechatOpenAbilityError('这缕机缘不存在', 404, 'SHARE_GIFT_NOT_FOUND');
  }
  const [claimed] = await getExecutor()
    .select({ id: wechatShareGiftClaims.id })
    .from(wechatShareGiftClaims)
    .where(
      and(
        eq(wechatShareGiftClaims.giftId, giftId),
        eq(wechatShareGiftClaims.receiverCultivatorId, actor.cultivatorId),
      ),
    )
    .limit(1);
  let reason = '';
  if (gift.senderCultivatorId === actor.cultivatorId) reason = '不能领取自己赠出的机缘';
  else if (claimed) reason = '你已经收下过这份机缘';
  else if (gift.status === 'expired') reason = '这缕机缘已经消散';
  else if (gift.status !== 'active' || gift.claimedCount >= gift.maxClaims)
    reason = '这缕机缘已经被有缘人收下';

  return {
    id: gift.id,
    senderName: gift.senderName,
    status: gift.status,
    expiresAt: gift.expiresAt.toISOString(),
    reward: shareGiftReward(),
    canClaim: !reason,
    reason: reason || null,
  };
}

export async function claimWechatShareGift(input: {
  actor: WechatOpenAbilityActor;
  giftId: string;
}) {
  const config = getConfig();
  if (!config.shareGift.enabled) {
    throw new WechatOpenAbilityError('赠予机缘尚未开启', 503, 'SHARE_GIFT_DISABLED');
  }
  const now = new Date();
  const dayStart = startOfShanghaiDay(now);
  return db.transaction(async (tx) => {
    const [receiver] = await tx
      .select({ id: cultivators.id, name: cultivators.name })
      .from(cultivators)
      .where(eq(cultivators.id, input.actor.cultivatorId))
      .for('update')
      .limit(1);
    if (!receiver) {
      throw new WechatOpenAbilityError('角色不存在', 404, 'CULTIVATOR_NOT_FOUND');
    }
    const [gift] = await tx
      .select()
      .from(wechatShareGifts)
      .where(eq(wechatShareGifts.id, input.giftId))
      .for('update')
      .limit(1);
    if (!gift) {
      throw new WechatOpenAbilityError('这缕机缘不存在', 404, 'SHARE_GIFT_NOT_FOUND');
    }
    if (gift.expiresAt <= now && gift.status === 'active') {
      await tx
        .update(wechatShareGifts)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(wechatShareGifts.id, gift.id));
      throw new WechatOpenAbilityError('这缕机缘已经消散', 409, 'SHARE_GIFT_EXPIRED');
    }
    if (gift.senderCultivatorId === input.actor.cultivatorId) {
      throw new WechatOpenAbilityError(
        '不能领取自己赠出的机缘',
        409,
        'SHARE_GIFT_SELF_CLAIM',
      );
    }
    if (gift.status !== 'active' || gift.claimedCount >= gift.maxClaims) {
      throw new WechatOpenAbilityError(
        '这缕机缘已经被有缘人收下',
        409,
        'SHARE_GIFT_ALREADY_TAKEN',
      );
    }
    const [existingClaim] = await tx
      .select({ id: wechatShareGiftClaims.id })
      .from(wechatShareGiftClaims)
      .where(
        and(
          eq(wechatShareGiftClaims.giftId, gift.id),
          eq(
            wechatShareGiftClaims.receiverCultivatorId,
            input.actor.cultivatorId,
          ),
        ),
      )
      .limit(1);
    if (existingClaim) {
      throw new WechatOpenAbilityError(
        '你已经收下过这份机缘',
        409,
        'SHARE_GIFT_ALREADY_CLAIMED',
      );
    }
    const [dailyClaimRow] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(wechatShareGiftClaims)
      .where(
        and(
          eq(
            wechatShareGiftClaims.receiverCultivatorId,
            input.actor.cultivatorId,
          ),
          gte(wechatShareGiftClaims.claimedAt, dayStart),
        ),
      );
    if (Number(dailyClaimRow?.total ?? 0) >= config.shareGift.dailyClaimLimit) {
      throw new WechatOpenAbilityError(
        '今日可收下的分享机缘已达上限',
        409,
        'SHARE_GIFT_CLAIM_DAILY_LIMIT',
      );
    }

    const reward = shareGiftReward(config);
    const rewardAttachments = await buildShareGiftRewardAttachments(config, tx);
    const receiverMail = await MailService.sendMail(
      input.actor.cultivatorId,
      '【机缘】有道友赠来一缕机缘',
      `${gift.senderName}赠来一缕天地机缘。你与赠礼道友均可在各自玉简中领取奖励。`,
      rewardAttachments,
      'reward',
      tx,
    );
    const senderMail = await MailService.sendMail(
      gift.senderCultivatorId,
      '【结缘】有缘人已收下你的机缘',
      `${receiver.name}已收下你赠出的天地机缘。这份结缘回礼可在此玉简中领取。`,
      rewardAttachments,
      'reward',
      tx,
    );
    await tx.insert(wechatShareGiftClaims).values({
      giftId: gift.id,
      receiverUserId: input.actor.userId,
      receiverCultivatorId: input.actor.cultivatorId,
      rewardMailId: receiverMail.id,
    });
    const nextClaimedCount = gift.claimedCount + 1;
    await tx
      .update(wechatShareGifts)
      .set({
        claimedCount: nextClaimedCount,
        status: nextClaimedCount >= gift.maxClaims ? 'completed' : 'active',
        updatedAt: now,
      })
      .where(eq(wechatShareGifts.id, gift.id));
    return {
      giftId: gift.id,
      senderName: gift.senderName,
      reward,
      mailId: receiverMail.id,
      senderMailId: senderMail.id,
      message: '双方奖励已送入传音玉简，请前往收件玉简领取',
    };
  });
}

async function dispatchQiIntent(intentId: string): Promise<'sent' | 'rescheduled' | 'cancelled' | 'failed' | 'skipped'> {
  const now = new Date();
  const [claimed] = await getExecutor()
    .update(wechatSubscriptionIntents)
    .set({
      status: 'sending',
      attemptCount: sql`${wechatSubscriptionIntents.attemptCount} + 1`,
      lastAttemptAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(wechatSubscriptionIntents.id, intentId),
        eq(wechatSubscriptionIntents.status, 'pending'),
      ),
    )
    .returning();
  if (!claimed) return 'skipped';

  try {
    const qi = await readProjectedQi(claimed.cultivatorId);
    if (qi.current < QI_MAX && qi.targetAt) {
      await getExecutor()
        .update(wechatSubscriptionIntents)
        .set({
          status: 'pending',
          targetAt: qi.targetAt,
          failureCode: null,
          failureMessage: null,
          updatedAt: new Date(),
        })
        .where(eq(wechatSubscriptionIntents.id, claimed.id));
      return 'rescheduled';
    }

    const config = getConfig();
    if (
      !config.qi.enabled ||
      !config.qi.templateData ||
      claimed.templateId !== config.qi.templateId
    ) {
      throw new WechatOpenAbilityError(
        '订阅消息模板配置已失效',
        503,
        'QI_TEMPLATE_NOT_CONFIGURED',
      );
    }
    const openId = await findWechatMiniGameOpenId(claimed.userId);
    if (!openId) {
      await getExecutor()
        .update(wechatSubscriptionIntents)
        .set({
          status: 'cancelled',
          failureCode: 'WECHAT_IDENTITY_MISSING',
          failureMessage: '账号已不再绑定微信小游戏身份',
          updatedAt: new Date(),
        })
        .where(eq(wechatSubscriptionIntents.id, claimed.id));
      return 'cancelled';
    }

    const data = renderTemplateData(config.qi.templateData, {
      qi: String(qi.current),
      maxQi: String(QI_MAX),
      cultivatorName: qi.cultivatorName,
      targetAt: claimed.targetAt.toISOString().replace('T', ' ').slice(0, 16),
    });
    await sendWechatMiniGameSubscribeMessage({
      openId,
      templateId: claimed.templateId,
      data,
      page: config.qi.page,
    });
    await getExecutor()
      .update(wechatSubscriptionIntents)
      .set({
        status: 'sent',
        sentAt: new Date(),
        failureCode: null,
        failureMessage: null,
        updatedAt: new Date(),
      })
      .where(eq(wechatSubscriptionIntents.id, claimed.id));
    return 'sent';
  } catch (error) {
    const permanentWechatRejection =
      error instanceof WechatMiniGameApiError && [43101, 47003].includes(Number(error.code));
    const attemptCount = claimed.attemptCount;
    const terminal = permanentWechatRejection || attemptCount >= MAX_DELIVERY_ATTEMPTS;
    await getExecutor()
      .update(wechatSubscriptionIntents)
      .set({
        status: terminal ? (permanentWechatRejection ? 'cancelled' : 'failed') : 'pending',
        targetAt: terminal ? claimed.targetAt : new Date(Date.now() + RETRY_DELAY_MS),
        failureCode:
          error instanceof WechatMiniGameApiError
            ? String(error.code)
            : error instanceof WechatOpenAbilityError
              ? error.code
              : 'DELIVERY_FAILED',
        failureMessage: error instanceof Error ? error.message.slice(0, 500) : '订阅消息发送失败',
        updatedAt: new Date(),
      })
      .where(eq(wechatSubscriptionIntents.id, claimed.id));
    return terminal ? (permanentWechatRejection ? 'cancelled' : 'failed') : 'rescheduled';
  }
}

export async function runWechatOpenAbilityMaintenance(limit = 50) {
  const now = new Date();
  await Promise.all([
    getExecutor()
      .update(wechatSubscriptionIntents)
      .set({ status: 'pending', updatedAt: now })
      .where(
        and(
          eq(wechatSubscriptionIntents.status, 'sending'),
          lte(
            wechatSubscriptionIntents.lastAttemptAt,
            new Date(now.getTime() - STALE_SENDING_MS),
          ),
        ),
      ),
    getExecutor()
      .update(wechatShareGifts)
      .set({ status: 'expired', updatedAt: now })
      .where(
        and(
          eq(wechatShareGifts.status, 'active'),
          lte(wechatShareGifts.expiresAt, now),
        ),
      ),
  ]);

  const due = await getExecutor()
    .select({ id: wechatSubscriptionIntents.id })
    .from(wechatSubscriptionIntents)
    .where(
      and(
        eq(wechatSubscriptionIntents.status, 'pending'),
        lte(wechatSubscriptionIntents.targetAt, now),
      ),
    )
    .orderBy(asc(wechatSubscriptionIntents.targetAt))
    .limit(Math.max(1, Math.min(200, Math.trunc(limit))));
  const results = await Promise.all(due.map((intent) => dispatchQiIntent(intent.id)));
  return {
    success: true,
    processed: results.length,
    sent: results.filter((item) => item === 'sent').length,
    rescheduled: results.filter((item) => item === 'rescheduled').length,
    cancelled: results.filter((item) => item === 'cancelled').length,
    failed: results.filter((item) => item === 'failed').length,
    skipped: results.filter((item) => item === 'skipped').length,
  };
}
