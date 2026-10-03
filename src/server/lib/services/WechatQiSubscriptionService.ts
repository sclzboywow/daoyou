import { findWechatMiniGameOpenId } from '@server/lib/auth/wechatMiniGameIdentity';
import { db, getExecutor, type DbTransaction } from '@server/lib/drizzle/db';
import {
  cultivators,
  wechatSubscriptionIntents,
} from '@server/lib/drizzle/schema';

import {
  sendWechatMiniGameSubscribeMessage,
  WechatMiniGameApiError,
} from '@server/lib/wechat/miniGameApi';
import { QI_MAX } from '@shared/config/qiSystem';

import { projectNaturalQiState } from '@shared/lib/qi';
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

const subscribeTemplateDataSchema = z.record(
  z.string().min(1),
  z.object({ value: z.string().max(20) }).strict(),
);

const QI_INTENT_KIND = 'qi_full' as const;
const MAX_DELIVERY_ATTEMPTS = 5;
const STALE_SENDING_MS = 10 * 60_000;
const RETRY_DELAY_MS = 5 * 60_000;

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

function getConfig() {
  const qiTemplateId =
    process.env.WECHAT_QI_FULL_SUBSCRIBE_TEMPLATE_ID?.trim() || '';
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
      enabled:
        wechatConfigured && Boolean(qiTemplateId) && Boolean(qiTemplateData),
      templateId: qiTemplateId,
      templateData: qiTemplateData,
      page: process.env.WECHAT_QI_FULL_SUBSCRIBE_PAGE?.trim() || undefined,
    },
  };
}

function renderTemplateData(
  template: Record<string, { value: string }>,
  variables: Record<string, string>,
): Record<string, { value: string }> {
  return Object.fromEntries(
    Object.entries(template).map(([key, entry]) => [
      key,
      {
        value: entry.value.replace(
          /\{\{([a-zA-Z0-9_]+)\}\}/g,
          (_, name: string) => variables[name] ?? '',
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

  const projection = projectNaturalQiState({
    qi: row.qi,
    qiLastRefreshedAt: row.qiLastRefreshedAt,
    now: new Date(),
  });
  if (projection.current < QI_MAX && !projection.recovery.fullRestoreAt) {
    throw new WechatOpenAbilityError(
      '灵气恢复时间暂不可用，请刷新角色后重试',
      409,
      'QI_RECOVERY_UNKNOWN',
    );
  }
  return {
    current: projection.current,
    targetAt: projection.recovery.fullRestoreAt,
    cultivatorName: row.name,
  };
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
          sql`${wechatSubscriptionIntents.status} IN ('pending', 'sending')`,
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
    throw new WechatOpenAbilityError(
      '订阅模板已更新，请重试',
      409,
      'TEMPLATE_CHANGED',
    );
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
      throw new WechatOpenAbilityError(
        '角色不存在',
        404,
        'CULTIVATOR_NOT_FOUND',
      );
    }
    const qi = await readProjectedQi(input.actor.cultivatorId, tx);
    if (!qi.targetAt) {
      throw new WechatOpenAbilityError(
        '当前天地灵气已充盈，无需设置提醒',
        409,
        'QI_ALREADY_FULL',
      );
    }

    // Repeated client retries keep the same outstanding reminder.
    const [existing] = await tx
      .select()
      .from(wechatSubscriptionIntents)
      .where(
        and(
          eq(wechatSubscriptionIntents.cultivatorId, input.actor.cultivatorId),
          eq(wechatSubscriptionIntents.kind, QI_INTENT_KIND),
          sql`${wechatSubscriptionIntents.status} IN ('pending', 'sending')`,
        ),
      )
      .limit(1);
    if (existing)
      return {
        id: existing.id,
        targetAt: existing.targetAt.toISOString(),
        currentQi: qi.current,
        maxQi: QI_MAX,
      };

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

async function dispatchQiIntent(
  intentId: string,
): Promise<'sent' | 'rescheduled' | 'cancelled' | 'failed' | 'skipped'> {
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
          attemptCount: Math.max(0, claimed.attemptCount - 1),
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
      error instanceof WechatMiniGameApiError &&
      [43101, 47003].includes(Number(error.code));
    const attemptCount = claimed.attemptCount;
    const terminal =
      permanentWechatRejection || attemptCount >= MAX_DELIVERY_ATTEMPTS;
    await getExecutor()
      .update(wechatSubscriptionIntents)
      .set({
        status: terminal
          ? permanentWechatRejection
            ? 'cancelled'
            : 'failed'
          : 'pending',
        targetAt: terminal
          ? claimed.targetAt
          : new Date(Date.now() + RETRY_DELAY_MS),
        failureCode:
          error instanceof WechatMiniGameApiError
            ? String(error.code)
            : error instanceof WechatOpenAbilityError
              ? error.code
              : 'DELIVERY_FAILED',
        failureMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : '订阅消息发送失败',
        updatedAt: new Date(),
      })
      .where(eq(wechatSubscriptionIntents.id, claimed.id));
    return terminal
      ? permanentWechatRejection
        ? 'cancelled'
        : 'failed'
      : 'rescheduled';
  }
}

export async function runWechatOpenAbilityMaintenance(limit = 50) {
  const now = new Date();
  await getExecutor()
    .update(wechatSubscriptionIntents)
    .set({ status: 'pending', updatedAt: now })
    .where(
      and(
        eq(wechatSubscriptionIntents.kind, QI_INTENT_KIND),
        eq(wechatSubscriptionIntents.status, 'sending'),
        lte(
          wechatSubscriptionIntents.lastAttemptAt,
          new Date(now.getTime() - STALE_SENDING_MS),
        ),
      ),
    );

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
  const results = await Promise.all(
    due.map((intent) => dispatchQiIntent(intent.id)),
  );
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
