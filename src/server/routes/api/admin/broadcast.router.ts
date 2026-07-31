import {
  RecipientResolveError,
  resolveEmailRecipients,
  resolveGameMailRecipients,
} from '@server/lib/admin/recipient-resolver';
import {
  normalizeTemplatePayload,
  renderTemplate,
} from '@server/lib/admin/template';
import { getExecutor } from '@server/lib/drizzle/db';
import { adminMessageTemplates } from '@server/lib/drizzle/schema';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { findPublishedItemLibraryForSelections } from '@server/lib/repositories/itemLibraryRepository';
import { createAdminBatchJob } from '@server/lib/services/AdminBatchJobService';
import type { MailAttachment } from '@server/lib/services/MailService';
import { REALM_VALUES } from '@shared/types/constants';
import {
  ItemLibraryResolveError,
  ItemLibraryRewardSelectionsSchema,
  resolveItemLibrarySelections,
  summarizeMailAttachments,
} from '@shared/lib/itemLibrary';
import { eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

const EmailBroadcastSchema = z
  .object({
    templateId: z.string().uuid().optional(),
    subject: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(10000).optional(),
    payload: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .default({}),
    filters: z
      .object({
        registeredFrom: z.string().optional(),
        registeredTo: z.string().optional(),
        hasActiveCultivator: z.boolean().optional(),
        realmMin: z.enum(REALM_VALUES).optional(),
        realmMax: z.enum(REALM_VALUES).optional(),
      })
      .default({}),
    dryRun: z.boolean().optional().default(false),
    idempotencyKey: z.string().trim().min(8).max(180).optional(),
    reason: z.string().trim().min(3).max(2_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.templateId && (!value.subject || !value.content)) {
      ctx.addIssue({
        code: 'custom',
        path: ['subject'],
        message: '未使用模板时，subject/content 必填',
      });
    }
    if (!value.dryRun && !value.idempotencyKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['idempotencyKey'],
        message: '正式发送必须提供幂等键',
      });
    }
    if (!value.dryRun && !value.reason) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: '正式发送必须填写操作原因',
      });
    }
  });

const GameMailBroadcastSchema = z
  .object({
    templateId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200).optional(),
    content: z.string().trim().min(1).max(10000).optional(),
    rewardSelections: ItemLibraryRewardSelectionsSchema.default([]),
    payload: z
      .record(z.string(), z.union([z.string(), z.number()]))
      .default({}),
    filters: z
      .object({
        targetCultivatorId: z.string().uuid().optional(),
        cultivatorCreatedFrom: z.string().optional(),
        cultivatorCreatedTo: z.string().optional(),
        realmMin: z.enum(REALM_VALUES).optional(),
        realmMax: z.enum(REALM_VALUES).optional(),
      })
      .default({}),
    dryRun: z.boolean().optional().default(false),
    idempotencyKey: z.string().trim().min(8).max(180).optional(),
    reason: z.string().trim().min(3).max(2_000).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.templateId && (!value.title || !value.content)) {
      ctx.addIssue({
        code: 'custom',
        path: ['title'],
        message: '未使用模板时，title/content 必填',
      });
    }
    if (!value.dryRun && !value.idempotencyKey) {
      ctx.addIssue({
        code: 'custom',
        path: ['idempotencyKey'],
        message: '正式发送必须提供幂等键',
      });
    }
    if (!value.dryRun && !value.reason) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: '正式发送必须填写操作原因',
      });
    }
  });

const router = new Hono<AppEnv>();

router.post('/email', requireAdmin(), async (c) => {
  const q = getExecutor();
  const body = await c.req.json().catch(() => null);
  const parsed = EmailBroadcastSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: '参数错误', details: parsed.error.flatten() },
      400,
    );
  }

  const { templateId, payload, filters, dryRun } = parsed.data;
  const resolvedRecipients = await resolveEmailRecipients(filters);

  if (dryRun) {
    return c.json({
      dryRun: true,
      totalRecipients: resolvedRecipients.totalCount,
      sampleRecipients: resolvedRecipients.sampleRecipients,
    });
  }

  let finalSubject = parsed.data.subject ?? '';
  let finalContent = parsed.data.content ?? '';

  if (templateId) {
    const template = await q.query.adminMessageTemplates.findFirst({
      where: eq(adminMessageTemplates.id, templateId),
    });

    if (!template) {
      return c.json({ error: '模板不存在' }, 404);
    }
    if (template.channel !== 'email') {
      return c.json({ error: '模板频道不匹配' }, 400);
    }
    if (template.status !== 'active') {
      return c.json({ error: '模板已停用' }, 400);
    }
    if (!template.subjectTemplate) {
      return c.json({ error: 'email 模板缺少 subjectTemplate' }, 400);
    }

    const mergedPayload = normalizeTemplatePayload(
      template.defaultPayload,
      payload,
    );
    finalSubject = renderTemplate(template.subjectTemplate, mergedPayload);
    finalContent = renderTemplate(template.contentTemplate, mergedPayload);
  }

  const user = c.get('user')!;
  const result = await createAdminBatchJob({
    jobType: 'email_broadcast',
    idempotencyKey: parsed.data.idempotencyKey!,
    requestedBy: user.id,
    requestedByEmail: user.email,
    reason: parsed.data.reason!,
    payload: {
      kind: 'email',
      subject: finalSubject,
      content: finalContent,
    },
    targetKeys: resolvedRecipients.recipients.map(
      (item) => item.recipientKey,
    ),
  });
  return c.json(
    { success: true, queued: true, created: result.created, job: result.job },
    202,
  );
});

router.post('/game-mail', requireAdmin(), async (c) => {
  const q = getExecutor();
  const body = await c.req.json().catch(() => null);
  const parsed = GameMailBroadcastSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: '参数错误', details: parsed.error.flatten() },
      400,
    );
  }

  const { templateId, filters, payload, dryRun } = parsed.data;
  let resolvedRecipients;
  try {
    resolvedRecipients = await resolveGameMailRecipients(filters);
  } catch (error) {
    if (error instanceof RecipientResolveError) {
      return c.json(
        { error: error.message },
        { status: error.status as 400 | 404 },
      );
    }
    throw error;
  }

  if (dryRun) {
    return c.json({
      dryRun: true,
      totalRecipients: resolvedRecipients.totalCount,
      sampleRecipients: resolvedRecipients.sampleRecipients,
    });
  }

  let finalTitle = parsed.data.title ?? '';
  let finalContent = parsed.data.content ?? '';

  if (templateId) {
    const template = await q.query.adminMessageTemplates.findFirst({
      where: eq(adminMessageTemplates.id, templateId),
    });

    if (!template) {
      return c.json({ error: '模板不存在' }, 404);
    }
    if (template.channel !== 'game_mail') {
      return c.json({ error: '模板频道不匹配' }, 400);
    }
    if (template.status !== 'active') {
      return c.json({ error: '模板已停用' }, 400);
    }

    const mergedPayload = normalizeTemplatePayload(
      template.defaultPayload,
      payload,
    );
    finalContent = renderTemplate(template.contentTemplate, mergedPayload);

    if (template.subjectTemplate) {
      finalTitle = renderTemplate(template.subjectTemplate, mergedPayload);
    } else if (!finalTitle) {
      return c.json(
        { error: '模板缺少标题，请填写 title 或配置 subjectTemplate' },
        400,
      );
    }
  }

  let attachments: MailAttachment[];

  try {
    const itemLibraryEntries = await findPublishedItemLibraryForSelections(
      parsed.data.rewardSelections,
    );
    attachments = resolveItemLibrarySelections(
      parsed.data.rewardSelections,
      itemLibraryEntries,
    );
  } catch (error) {
    if (error instanceof ItemLibraryResolveError) {
      return c.json({ error: error.message }, 400);
    }

    return c.json(
      {
        error:
          error instanceof Error ? error.message : '道具库加载失败',
      },
      500,
    );
  }

  const user = c.get('user')!;
  const result = await createAdminBatchJob({
    jobType: 'game_mail_broadcast',
    idempotencyKey: parsed.data.idempotencyKey!,
    requestedBy: user.id,
    requestedByEmail: user.email,
    reason: parsed.data.reason!,
    payload: {
      kind: 'game_mail',
      title: finalTitle,
      content: finalContent,
      attachments,
    },
    targetKeys: resolvedRecipients.recipients.map(
      (recipient) => recipient.recipientKey,
    ),
  });
  return c.json(
    {
      success: true,
      queued: true,
      created: result.created,
      job: result.job,
      rewardSummary: summarizeMailAttachments(attachments),
    },
    202,
  );
});

export default router;
