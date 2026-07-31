import { sendViaSmtp } from '@server/lib/admin/smtp';
import {
  db,
  getExecutor,
  type DbTransaction,
} from '@server/lib/drizzle/db';
import {
  adminBatchJobItems,
  adminBatchJobs,
  mails,
} from '@server/lib/drizzle/schema';
import type { AdminBatchJobData } from '@server/lib/mq/admin-batch/types';
import { MQ_KEYS } from '@server/lib/mq/mqKeys';
import { getMqQueue } from '@server/lib/mq/queueRegistry';
import type {
  AdminBatchJobItemView,
  AdminBatchJobStatus,
  AdminBatchJobView,
} from '@shared/contracts/adminPlatform';
import type { MailAttachment } from '@shared/types/mail';
import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  lt,
  sql,
} from 'drizzle-orm';

type EmailBatchPayload = {
  kind: 'email';
  subject: string;
  content: string;
};

type GameMailBatchPayload = {
  kind: 'game_mail';
  title: string;
  content: string;
  attachments: MailAttachment[];
};

export type AdminBatchPayload =
  | EmailBatchPayload
  | GameMailBatchPayload;

const JOB_ITEM_BATCH_SIZE = 500;
const RECOVERY_STALE_MS = 10 * 60 * 1000;

function toJobView(
  row: typeof adminBatchJobs.$inferSelect,
): AdminBatchJobView {
  return {
    id: row.id,
    jobType: row.jobType,
    status: row.status as AdminBatchJobStatus,
    reason: row.reason,
    totalCount: row.totalCount,
    succeededCount: row.succeededCount,
    failedCount: row.failedCount,
    skippedCount: row.skippedCount,
    errorSummary: row.errorSummary,
    requestedByEmail: row.requestedByEmail,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toItemView(
  row: typeof adminBatchJobItems.$inferSelect,
): AdminBatchJobItemView {
  return {
    id: row.id,
    targetKey: row.targetKey,
    status: row.status,
    attempts: row.attempts,
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}

export async function enqueueAdminBatchJob(
  jobId: string,
  version = Date.now(),
): Promise<void> {
  const queue = getMqQueue<AdminBatchJobData>(MQ_KEYS.queues.adminBatch);
  await queue.add(
    MQ_KEYS.jobs.processAdminBatch,
    { adminBatchJobId: jobId },
    { jobId: `admin-${jobId}-${version}` },
  );
}

export async function createAdminBatchJob(args: {
  jobType: string;
  idempotencyKey: string;
  requestedBy: string;
  requestedByEmail: string;
  reason: string;
  payload: AdminBatchPayload;
  targetKeys: string[];
  tx?: DbTransaction;
}): Promise<{ job: AdminBatchJobView; created: boolean }> {
  if (!args.tx) {
    const result = await db.transaction((tx) =>
      createAdminBatchJob({ ...args, tx }),
    );
    if (result.created) {
      await enqueueAdminBatchJob(result.job.id, Date.now());
    }
    return result;
  }
  const q = getExecutor(args.tx);
  const uniqueTargets = [...new Set(args.targetKeys)];
  const [inserted] = await q
    .insert(adminBatchJobs)
    .values({
      jobType: args.jobType,
      idempotencyKey: args.idempotencyKey,
      requestedBy: args.requestedBy,
      requestedByEmail: args.requestedByEmail,
      reason: args.reason,
      payload: args.payload,
      totalCount: uniqueTargets.length,
    })
    .onConflictDoNothing({ target: adminBatchJobs.idempotencyKey })
    .returning();

  if (!inserted) {
    const existing = await q.query.adminBatchJobs.findFirst({
      where: eq(adminBatchJobs.idempotencyKey, args.idempotencyKey),
    });
    if (!existing) throw new Error('批处理幂等记录读取失败');
    return { job: toJobView(existing), created: false };
  }

  for (let index = 0; index < uniqueTargets.length; index += JOB_ITEM_BATCH_SIZE) {
    const batch = uniqueTargets.slice(index, index + JOB_ITEM_BATCH_SIZE);
    if (batch.length === 0) continue;
    await q.insert(adminBatchJobItems).values(
      batch.map((targetKey) => ({
        jobId: inserted.id,
        targetKey,
      })),
    );
  }

  return { job: toJobView(inserted), created: true };
}

async function deliverBatchItem(args: {
  job: typeof adminBatchJobs.$inferSelect;
  item: typeof adminBatchJobItems.$inferSelect;
  payload: AdminBatchPayload;
}): Promise<Record<string, unknown>> {
  if (args.payload.kind === 'email') {
    await sendViaSmtp(
      args.item.targetKey,
      args.payload.subject,
      args.payload.content,
      { messageId: `<admin-${args.item.id}@yzdoc.cn>` },
    );
    return { channel: 'email' };
  }

  const mailType =
    args.payload.attachments.length > 0 ? 'reward' : 'system';
  const deduplicationKey = `admin-batch:${args.item.id}`;
  const [mail] = await getExecutor()
    .insert(mails)
    .values({
      cultivatorId: args.item.targetKey,
      title: args.payload.title,
      content: args.payload.content,
      type: mailType,
      attachments: args.payload.attachments,
      deduplicationKey,
      isRead: false,
      isClaimed: false,
    })
    .onConflictDoNothing()
    .returning({ id: mails.id });
  return {
    channel: 'game_mail',
    mailId: mail?.id ?? null,
    deduplicated: !mail,
  };
}

export async function processAdminBatchJob(jobId: string): Promise<void> {
  const q = getExecutor();
  const [job] = await q
    .update(adminBatchJobs)
    .set({
      status: 'running',
      startedAt: new Date(),
      finishedAt: null,
      errorSummary: null,
    })
    .where(
      and(
        eq(adminBatchJobs.id, jobId),
        inArray(adminBatchJobs.status, [
          'queued',
          'partial_failed',
          'failed',
        ]),
      ),
    )
    .returning();

  if (!job) return;
  const payload = job.payload as AdminBatchPayload;

  const items = await q
    .select()
    .from(adminBatchJobItems)
    .where(
      and(
        eq(adminBatchJobItems.jobId, job.id),
        eq(adminBatchJobItems.status, 'pending'),
      ),
    )
    .orderBy(asc(adminBatchJobItems.createdAt));

  for (const item of items) {
    const currentJob = await q.query.adminBatchJobs.findFirst({
      columns: { status: true },
      where: eq(adminBatchJobs.id, job.id),
    });
    if (currentJob?.status === 'cancelled') return;

    await q
      .update(adminBatchJobItems)
      .set({
        status: 'running',
        attempts: sql`${adminBatchJobItems.attempts} + 1`,
        startedAt: new Date(),
        error: null,
      })
      .where(eq(adminBatchJobItems.id, item.id));

    try {
      const result = await deliverBatchItem({ job, item, payload });
      await q
        .update(adminBatchJobItems)
        .set({
          status: 'succeeded',
          result,
          finishedAt: new Date(),
        })
        .where(eq(adminBatchJobItems.id, item.id));
    } catch (error) {
      await q
        .update(adminBatchJobItems)
        .set({
          status: 'failed',
          error: error instanceof Error ? error.message.slice(0, 2_000) : String(error),
          finishedAt: new Date(),
        })
        .where(eq(adminBatchJobItems.id, item.id));
    }
    await q
      .update(adminBatchJobs)
      .set({ updatedAt: new Date() })
      .where(eq(adminBatchJobs.id, job.id));
  }

  const [counts] = await q
    .select({
      succeeded: sql<number>`count(*) filter (where ${adminBatchJobItems.status} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${adminBatchJobItems.status} = 'failed')::int`,
      skipped: sql<number>`count(*) filter (where ${adminBatchJobItems.status} = 'skipped')::int`,
      pending: sql<number>`count(*) filter (where ${adminBatchJobItems.status} in ('pending', 'running'))::int`,
    })
    .from(adminBatchJobItems)
    .where(eq(adminBatchJobItems.jobId, job.id));

  const succeeded = Number(counts?.succeeded ?? 0);
  const failed = Number(counts?.failed ?? 0);
  const skipped = Number(counts?.skipped ?? 0);
  const pending = Number(counts?.pending ?? 0);
  const status =
    pending > 0
      ? 'failed'
      : failed === 0
        ? 'succeeded'
        : succeeded > 0
          ? 'partial_failed'
          : 'failed';

  await q
    .update(adminBatchJobs)
    .set({
      status,
      succeededCount: succeeded,
      failedCount: failed,
      skippedCount: skipped,
      finishedAt: new Date(),
      errorSummary:
        failed > 0 ? `${failed} 个目标执行失败，可在任务中心重试` : null,
    })
    .where(eq(adminBatchJobs.id, job.id));
}

export async function markAdminBatchJobForQueueRetry(
  jobId: string,
  error: unknown,
): Promise<void> {
  await getExecutor()
    .update(adminBatchJobs)
    .set({
      status: 'queued',
      errorSummary:
        error instanceof Error ? error.message.slice(0, 2_000) : String(error),
    })
    .where(
      and(
        eq(adminBatchJobs.id, jobId),
        eq(adminBatchJobs.status, 'running'),
      ),
    );
}

export async function listAdminBatchJobs(args: {
  page?: number;
  pageSize?: number;
  status?: string;
} = {}) {
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, args.pageSize ?? 30));
  const q = getExecutor();
  const conditions = args.status
    ? eq(adminBatchJobs.status, args.status)
    : undefined;
  const [rows, [totalRow]] = await Promise.all([
    q
      .select()
      .from(adminBatchJobs)
      .where(conditions)
      .orderBy(desc(adminBatchJobs.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    q.select({ count: count() }).from(adminBatchJobs).where(conditions),
  ]);
  return {
    jobs: rows.map(toJobView),
    page,
    pageSize,
    total: Number(totalRow?.count ?? 0),
  };
}

export async function getAdminBatchJob(jobId: string) {
  const q = getExecutor();
  const job = await q.query.adminBatchJobs.findFirst({
    where: eq(adminBatchJobs.id, jobId),
  });
  if (!job) return null;
  const items = await q
    .select()
    .from(adminBatchJobItems)
    .where(eq(adminBatchJobItems.jobId, job.id))
    .orderBy(asc(adminBatchJobItems.createdAt))
    .limit(500);
  return { job: toJobView(job), items: items.map(toItemView) };
}

export async function cancelAdminBatchJob(jobId: string) {
  const [job] = await getExecutor()
    .update(adminBatchJobs)
    .set({ status: 'cancelled', finishedAt: new Date() })
    .where(
      and(
        eq(adminBatchJobs.id, jobId),
        inArray(adminBatchJobs.status, ['queued', 'running']),
      ),
    )
    .returning();
  return job ? toJobView(job) : null;
}

export async function retryAdminBatchJob(jobId: string) {
  const q = getExecutor();
  const job = await q.query.adminBatchJobs.findFirst({
    where: eq(adminBatchJobs.id, jobId),
  });
  if (!job || !['failed', 'partial_failed'].includes(job.status)) return null;
  await q
    .update(adminBatchJobItems)
    .set({
      status: 'pending',
      error: null,
      startedAt: null,
      finishedAt: null,
    })
    .where(
      and(
        eq(adminBatchJobItems.jobId, job.id),
        eq(adminBatchJobItems.status, 'failed'),
      ),
    );
  const [updated] = await q
    .update(adminBatchJobs)
    .set({
      status: 'queued',
      failedCount: 0,
      errorSummary: null,
      finishedAt: null,
    })
    .where(eq(adminBatchJobs.id, job.id))
    .returning();
  await enqueueAdminBatchJob(updated.id, updated.updatedAt.getTime());
  return toJobView(updated);
}

export async function recoverAdminBatchJobs(): Promise<number> {
  const q = getExecutor();
  const stalledJobs = await q
    .update(adminBatchJobs)
    .set({ status: 'queued', startedAt: null })
    .where(
      and(
        eq(adminBatchJobs.status, 'running'),
        lt(adminBatchJobs.updatedAt, new Date(Date.now() - RECOVERY_STALE_MS)),
      ),
    )
    .returning({ id: adminBatchJobs.id });
  if (stalledJobs.length > 0) {
    await q
      .update(adminBatchJobItems)
      .set({ status: 'pending', startedAt: null })
      .where(
        and(
          inArray(
            adminBatchJobItems.jobId,
            stalledJobs.map((job) => job.id),
          ),
          eq(adminBatchJobItems.status, 'running'),
        ),
      );
  }

  const jobs = await q
    .select({ id: adminBatchJobs.id, updatedAt: adminBatchJobs.updatedAt })
    .from(adminBatchJobs)
    .where(eq(adminBatchJobs.status, 'queued'))
    .orderBy(asc(adminBatchJobs.createdAt))
    .limit(100);
  for (const job of jobs) {
    await enqueueAdminBatchJob(job.id, job.updatedAt.getTime());
  }
  return jobs.length;
}
