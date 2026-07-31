import { getExecutor } from '@server/lib/drizzle/db';
import { adminAuditLogs } from '@server/lib/drizzle/schema';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { and, desc, eq, ilike, type SQL } from 'drizzle-orm';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/', requireAdmin(), async (c) => {
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query('pageSize') ?? '30', 10)),
  );
  const action = c.req.query('action')?.trim();
  const status = c.req.query('status')?.trim();
  const actorEmail = c.req.query('actorEmail')?.trim();
  const conditions: SQL<unknown>[] = [];
  if (action) conditions.push(ilike(adminAuditLogs.action, `%${action}%`));
  if (status) conditions.push(eq(adminAuditLogs.status, status));
  if (actorEmail) {
    conditions.push(ilike(adminAuditLogs.actorEmail, `%${actorEmail}%`));
  }

  const q = getExecutor();
  const rows = await q
    .select()
    .from(adminAuditLogs)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(adminAuditLogs.createdAt))
    .limit(pageSize + 1)
    .offset((page - 1) * pageSize);

  const hasMore = rows.length > pageSize;
  return c.json({
    success: true,
    data: rows.slice(0, pageSize).map((row) => ({
      id: row.id,
      actorEmail: row.actorEmail,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      reason: row.reason,
      status: row.status,
      ipAddress: row.ipAddress,
      requestSummary: row.requestSummary,
      responseSummary: row.responseSummary,
      createdAt: row.createdAt.toISOString(),
    })),
    page,
    pageSize,
    hasMore,
  });
});

export default router;
