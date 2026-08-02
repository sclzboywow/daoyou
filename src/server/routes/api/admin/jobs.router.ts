import { getExecutor } from '@server/lib/drizzle/db';
import { systemJobRuns } from '@server/lib/drizzle/schema';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  cancelAdminBatchJob,
  getAdminBatchJob,
  listAdminBatchJobs,
  retryAdminBatchJob,
} from '@server/lib/services/AdminBatchJobService';
import { desc, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
const IdSchema = z.string().uuid();

router.get('/', requireAdmin(), async (c) => {
  const result = await listAdminBatchJobs({
    page: Number.parseInt(c.req.query('page') ?? '1', 10),
    pageSize: Number.parseInt(c.req.query('pageSize') ?? '30', 10),
    status: c.req.query('status'),
  });
  return c.json({ success: true, ...result });
});

router.get('/system-runs', requireAdmin(), async (c) => {
  const jobName = c.req.query('jobName')?.trim();
  const rows = await getExecutor()
    .select()
    .from(systemJobRuns)
    .where(jobName ? eq(systemJobRuns.jobName, jobName) : undefined)
    .orderBy(desc(systemJobRuns.startedAt))
    .limit(200);
  return c.json({
    success: true,
    runs: rows.map((row) => ({
      ...row,
      startedAt: row.startedAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});

router.get('/:id', requireAdmin(), async (c) => {
  const parsed = IdSchema.safeParse(c.req.param('id'));
  if (!parsed.success) return c.json({ error: '任务 ID 无效' }, 400);
  const result = await getAdminBatchJob(parsed.data);
  if (!result) return c.json({ error: '任务不存在' }, 404);
  return c.json({ success: true, ...result });
});

router.post('/:id/cancel', requireAdmin(), async (c) => {
  const parsed = IdSchema.safeParse(c.req.param('id'));
  if (!parsed.success) return c.json({ error: '任务 ID 无效' }, 400);
  const job = await cancelAdminBatchJob(parsed.data);
  if (!job) return c.json({ error: '任务当前状态不可取消' }, 409);
  return c.json({ success: true, job });
});

router.post('/:id/retry', requireAdmin(), async (c) => {
  const parsed = IdSchema.safeParse(c.req.param('id'));
  if (!parsed.success) return c.json({ error: '任务 ID 无效' }, 400);
  const job = await retryAdminBatchJob(parsed.data);
  if (!job) return c.json({ error: '任务当前状态不可重试' }, 409);
  return c.json({ success: true, job });
});

export default router;
