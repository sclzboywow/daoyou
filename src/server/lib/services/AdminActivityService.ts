import { resolveGameMailRecipients } from '@server/lib/admin/recipient-resolver';
import { db, getExecutor } from '@server/lib/drizzle/db';
import {
  activityClaims,
  adminActivities,
  cultivators,
  mails,
  redeemCodes,
} from '@server/lib/drizzle/schema';
import { findPublishedItemLibraryForSelections } from '@server/lib/repositories/itemLibraryRepository';
import { createAdminBatchJob } from '@server/lib/services/AdminBatchJobService';
import type {
  AdminActivityAudience,
  AdminActivityConfig,
  AdminActivityStatus,
  AdminActivityView,
  AdminActivityWrite,
  PlayerActivityView,
} from '@shared/contracts/adminPlatform';
import {
  AdminActivityConfigSchema,
  AdminActivityWriteSchema,
} from '@shared/contracts/adminPlatform';
import {
  resolveItemLibrarySelections,
  summarizeMailAttachments,
} from '@shared/lib/itemLibrary';
import { REALM_VALUES } from '@shared/types/constants';
import type { MailAttachment } from '@shared/types/mail';
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from 'drizzle-orm';

function toActivityView(
  row: typeof adminActivities.$inferSelect,
): AdminActivityView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    activityType: row.activityType as AdminActivityView['activityType'],
    status: row.status as AdminActivityStatus,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt?.toISOString() ?? null,
    audience: row.audience as AdminActivityAudience,
    config: AdminActivityConfigSchema.parse(row.config),
    version: row.version,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function resolveRewardSnapshot(
  config: AdminActivityConfig,
): Promise<AdminActivityConfig> {
  if (!('rewardSelections' in config)) return config;
  const entries = await findPublishedItemLibraryForSelections(
    config.rewardSelections,
  );
  const rewardSnapshot = resolveItemLibrarySelections(
    config.rewardSelections,
    entries,
  );
  return { ...config, rewardSnapshot };
}

export async function listAdminActivities(): Promise<AdminActivityView[]> {
  const rows = await getExecutor()
    .select()
    .from(adminActivities)
    .orderBy(desc(adminActivities.createdAt));
  return rows.map(toActivityView);
}

export async function createAdminActivity(
  input: AdminActivityWrite,
  userId: string,
): Promise<AdminActivityView> {
  const data = AdminActivityWriteSchema.parse(input);
  const [row] = await getExecutor()
    .insert(adminActivities)
    .values({
      code: data.code,
      name: data.name,
      activityType: data.activityType,
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      audience: data.audience,
      config: data.config,
      createdBy: userId,
      updatedBy: userId,
    })
    .returning();
  return toActivityView(row);
}

export async function updateAdminActivity(
  id: string,
  input: AdminActivityWrite,
  userId: string,
): Promise<AdminActivityView | null> {
  const data = AdminActivityWriteSchema.parse(input);
  const [row] = await getExecutor()
    .update(adminActivities)
    .set({
      code: data.code,
      name: data.name,
      activityType: data.activityType,
      startsAt: new Date(data.startsAt),
      endsAt: data.endsAt ? new Date(data.endsAt) : null,
      audience: data.audience,
      config: data.config,
      updatedBy: userId,
      version: sql`${adminActivities.version} + 1`,
    })
    .where(
      and(
        eq(adminActivities.id, id),
        eq(adminActivities.status, 'draft'),
      ),
    )
    .returning();
  return row ? toActivityView(row) : null;
}

export async function previewAdminActivity(id: string) {
  const row = await getExecutor().query.adminActivities.findFirst({
    where: eq(adminActivities.id, id),
  });
  if (!row) return null;
  const config = await resolveRewardSnapshot(
    AdminActivityConfigSchema.parse(row.config),
  );
  const rewardSummary =
    'rewardSnapshot' in config
      ? summarizeMailAttachments(
          (config.rewardSnapshot ?? []) as MailAttachment[],
        )
      : [];
  let audienceCount: number | null = null;
  if (row.activityType === 'game_mail') {
    audienceCount = (
      await resolveGameMailRecipients(row.audience as AdminActivityAudience)
    ).totalCount;
  }
  return { activity: toActivityView(row), audienceCount, rewardSummary };
}

export async function publishAdminActivity(
  id: string,
  userId: string,
): Promise<AdminActivityView | null> {
  const q = getExecutor();
  const row = await q.query.adminActivities.findFirst({
    where: eq(adminActivities.id, id),
  });
  if (!row || row.status !== 'draft') return null;
  let config = await resolveRewardSnapshot(
    AdminActivityConfigSchema.parse(row.config),
  );
  if (config.kind === 'redeem_code') {
    const code =
      config.code?.trim().toUpperCase() ??
      `DAOYOU-${crypto.randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`;
    if (!/^[A-Z0-9_-]{6,64}$/.test(code)) {
      throw new Error('兑换码仅支持大写字母、数字、下划线和中划线');
    }
    const [redeem] = await q
      .insert(redeemCodes)
      .values({
        code,
        rewardPresetId: `activity:${row.code}:v${row.version}`,
        rewardAttachments: (config.rewardSnapshot ?? []) as MailAttachment[],
        mailTitle: config.mailTitle,
        mailContent: config.mailContent,
        totalLimit: config.totalLimit ?? null,
        startsAt: row.startsAt,
        endsAt: row.endsAt,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning({ id: redeemCodes.id });
    config = { ...config, code, redeemCodeId: redeem.id };
  }
  const now = new Date();
  const status =
    row.startsAt <= now && (!row.endsAt || row.endsAt > now)
      ? 'active'
      : 'scheduled';
  const [updated] = await q
    .update(adminActivities)
    .set({
      status,
      config,
      publishedAt: now,
      updatedBy: userId,
    })
    .where(
      and(
        eq(adminActivities.id, row.id),
        eq(adminActivities.status, 'draft'),
      ),
    )
    .returning();
  return updated ? toActivityView(updated) : null;
}

export async function disableAdminActivity(
  id: string,
  userId: string,
): Promise<AdminActivityView | null> {
  const [row] = await getExecutor()
    .update(adminActivities)
    .set({ status: 'disabled', updatedBy: userId })
    .where(
      and(
        eq(adminActivities.id, id),
        inArray(adminActivities.status, ['scheduled', 'active']),
      ),
    )
    .returning();
  if (row) {
    const config = AdminActivityConfigSchema.parse(row.config);
    if (config.kind === 'redeem_code' && config.redeemCodeId) {
      await getExecutor()
        .update(redeemCodes)
        .set({ status: 'disabled', updatedBy: userId })
        .where(eq(redeemCodes.id, config.redeemCodeId));
    }
  }
  return row ? toActivityView(row) : null;
}

export async function enableAdminActivity(
  id: string,
  userId: string,
): Promise<AdminActivityView | null> {
  const q = getExecutor();
  const existing = await q.query.adminActivities.findFirst({
    where: and(
      eq(adminActivities.id, id),
      eq(adminActivities.status, 'disabled'),
    ),
  });
  if (!existing || (existing.endsAt && existing.endsAt <= new Date())) {
    return null;
  }
  const status = existing.startsAt <= new Date() ? 'active' : 'scheduled';
  const [row] = await q
    .update(adminActivities)
    .set({ status, updatedBy: userId })
    .where(
      and(
        eq(adminActivities.id, id),
        eq(adminActivities.status, 'disabled'),
      ),
    )
    .returning();
  if (row) {
    const config = AdminActivityConfigSchema.parse(row.config);
    if (config.kind === 'redeem_code' && config.redeemCodeId) {
      await q
        .update(redeemCodes)
        .set({ status: 'active', updatedBy: userId })
        .where(eq(redeemCodes.id, config.redeemCodeId));
    }
  }
  return row ? toActivityView(row) : null;
}

export async function dispatchActivities(): Promise<number> {
  const q = getExecutor();
  const now = new Date();
  await q
    .update(adminActivities)
    .set({ status: 'ended' })
    .where(
      and(
        inArray(adminActivities.status, ['scheduled', 'active']),
        lte(adminActivities.endsAt, now),
      ),
    );
  const activated = await q
    .update(adminActivities)
    .set({ status: 'active' })
    .where(
      and(
        eq(adminActivities.status, 'scheduled'),
        lte(adminActivities.startsAt, now),
        or(isNull(adminActivities.endsAt), gte(adminActivities.endsAt, now)),
      ),
    )
    .returning();
  const activeMailActivities = await q
    .select()
    .from(adminActivities)
    .where(
      and(
        eq(adminActivities.status, 'active'),
        eq(adminActivities.activityType, 'game_mail'),
      ),
    );
  for (const activity of activeMailActivities) {
    const config = AdminActivityConfigSchema.parse(activity.config);
    if (config.kind !== 'game_mail') continue;
    const recipients = await resolveGameMailRecipients(
      activity.audience as AdminActivityAudience,
    );
    await createAdminBatchJob({
      jobType: 'activity_game_mail',
      idempotencyKey: `activity:${activity.id}:v${activity.version}`,
      requestedBy: activity.updatedBy,
      requestedByEmail: 'system@yzdoc.cn',
      reason: `活动「${activity.name}」自动投放`,
      payload: {
        kind: 'game_mail',
        title: config.title,
        content: config.content,
        attachments: (config.rewardSnapshot ?? []) as MailAttachment[],
      },
      targetKeys: recipients.recipients.map((item) => item.recipientKey),
    });
  }
  return activated.length;
}

function matchesAudience(
  audience: AdminActivityAudience,
  cultivator: {
    realm: string;
    createdAt: Date | null;
  },
): boolean {
  const realmIndex = REALM_VALUES.indexOf(
    cultivator.realm as (typeof REALM_VALUES)[number],
  );
  if (
    audience.realmMin &&
    realmIndex < REALM_VALUES.indexOf(audience.realmMin)
  ) {
    return false;
  }
  if (
    audience.realmMax &&
    realmIndex > REALM_VALUES.indexOf(audience.realmMax)
  ) {
    return false;
  }
  const createdAt = cultivator.createdAt?.getTime() ?? 0;
  if (
    audience.cultivatorCreatedFrom &&
    createdAt < new Date(audience.cultivatorCreatedFrom).getTime()
  ) {
    return false;
  }
  if (
    audience.cultivatorCreatedTo &&
    createdAt > new Date(audience.cultivatorCreatedTo).getTime()
  ) {
    return false;
  }
  return true;
}

export async function listPlayerActivities(
  cultivatorId: string,
): Promise<PlayerActivityView[]> {
  const q = getExecutor();
  const cultivator = await q.query.cultivators.findFirst({
    columns: { realm: true, createdAt: true },
    where: eq(cultivators.id, cultivatorId),
  });
  if (!cultivator) return [];
  const rows = await q
    .select()
    .from(adminActivities)
    .where(
      and(
        eq(adminActivities.status, 'active'),
        inArray(adminActivities.activityType, [
          'login_reward',
          'announcement',
        ]),
      ),
    )
    .orderBy(asc(adminActivities.endsAt), desc(adminActivities.createdAt));
  const claims = await q
    .select({ activityId: activityClaims.activityId })
    .from(activityClaims)
    .where(eq(activityClaims.cultivatorId, cultivatorId));
  const claimed = new Set(claims.map((item) => item.activityId));
  return rows
    .filter((row) =>
      matchesAudience(row.audience as AdminActivityAudience, cultivator),
    )
    .map((row) => {
      const config = AdminActivityConfigSchema.parse(row.config);
      if (config.kind === 'announcement') {
        return {
          id: row.id,
          code: row.code,
          name: row.name,
          activityType: 'announcement' as const,
          startsAt: row.startsAt.toISOString(),
          endsAt: row.endsAt?.toISOString() ?? null,
          title: config.title,
          content: config.content,
          rewardSummary: [],
          claimed: false,
        };
      }
      const rewardSnapshot =
        config.kind === 'login_reward' ? config.rewardSnapshot ?? [] : [];
      return {
        id: row.id,
        code: row.code,
        name: row.name,
        activityType: 'login_reward' as const,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        title: config.kind === 'login_reward' ? config.mailTitle : row.name,
        content:
          config.kind === 'login_reward' ? config.description : row.name,
        rewardSummary: summarizeMailAttachments(
          rewardSnapshot as MailAttachment[],
        ),
        claimed: claimed.has(row.id),
      };
    });
}

export async function claimLoginActivity(
  activityId: string,
  cultivatorId: string,
): Promise<{ claimed: boolean; mailId: string | null }> {
  return db.transaction(async (tx) => {
    const activity = await tx.query.adminActivities.findFirst({
      where: and(
        eq(adminActivities.id, activityId),
        eq(adminActivities.status, 'active'),
        eq(adminActivities.activityType, 'login_reward'),
      ),
    });
    if (!activity) throw new Error('活动不存在或未开放');
    const cultivator = await tx.query.cultivators.findFirst({
      columns: { realm: true, createdAt: true },
      where: eq(cultivators.id, cultivatorId),
    });
    if (
      !cultivator ||
      !matchesAudience(
        activity.audience as AdminActivityAudience,
        cultivator,
      )
    ) {
      throw new Error('当前角色不满足活动条件');
    }
    const [claim] = await tx
      .insert(activityClaims)
      .values({ activityId, cultivatorId })
      .onConflictDoNothing()
      .returning({ id: activityClaims.id });
    if (!claim) {
      const existing = await tx.query.activityClaims.findFirst({
        columns: { mailId: true },
        where: and(
          eq(activityClaims.activityId, activityId),
          eq(activityClaims.cultivatorId, cultivatorId),
        ),
      });
      return { claimed: false, mailId: existing?.mailId ?? null };
    }
    const config = AdminActivityConfigSchema.parse(activity.config);
    if (config.kind !== 'login_reward') throw new Error('活动配置错误');
    const [mail] = await tx
      .insert(mails)
      .values({
        cultivatorId,
        title: config.mailTitle,
        content: config.mailContent,
        type: 'reward',
        attachments: (config.rewardSnapshot ?? []) as MailAttachment[],
        deduplicationKey: `activity:${activityId}:${cultivatorId}`,
      })
      .onConflictDoNothing()
      .returning({ id: mails.id });
    const mailId =
      mail?.id ??
      (
        await tx.query.mails.findFirst({
          columns: { id: true },
          where: eq(
            mails.deduplicationKey,
            `activity:${activityId}:${cultivatorId}`,
          ),
        })
      )?.id ??
      null;
    await tx
      .update(activityClaims)
      .set({ mailId })
      .where(eq(activityClaims.id, claim.id));
    return { claimed: true, mailId };
  });
}
