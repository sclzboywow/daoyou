import { authUsers } from '@server/lib/auth/schema';
import { getExecutor } from '@server/lib/drizzle/db';
import {
  consumables,
  creationProducts,
  cultivators,
  cultivatorTasks,
  dungeonHistories,
  mails,
  materials,
  resourceEvents,
  resourceScopes,
  sectMemberships,
} from '@server/lib/drizzle/schema';
import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { findPublishedItemLibraryForSelections } from '@server/lib/repositories/itemLibraryRepository';
import { createAdminBatchJob } from '@server/lib/services/AdminBatchJobService';
import {
  ItemLibraryResolveError,
  ItemLibraryRewardSelectionsSchema,
  resolveItemLibrarySelections,
} from '@shared/lib/itemLibrary';
import { REALM_VALUES } from '@shared/types/constants';
import {
  and,
  count,
  desc,
  eq,
  ilike,
  or,
  sql,
  sum,
  type SQL,
} from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
const IdSchema = z.string().uuid();
const CompensationSchema = z.object({
  title: z.string().trim().min(1).max(200),
  content: z.string().trim().min(1).max(10_000),
  rewardSelections: ItemLibraryRewardSelectionsSchema.default([]),
  reason: z.string().trim().min(3).max(2_000),
  idempotencyKey: z.string().trim().min(8).max(180),
});

router.get('/', requireAdmin(), async (c) => {
  const page = Math.max(1, Number.parseInt(c.req.query('page') ?? '1', 10));
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(c.req.query('pageSize') ?? '30', 10)),
  );
  const keyword = c.req.query('keyword')?.trim();
  const realm = c.req.query('realm')?.trim();
  const status = c.req.query('status')?.trim();
  const conditions: SQL<unknown>[] = [];
  if (keyword) {
    conditions.push(
      or(
        ilike(cultivators.name, `%${keyword}%`),
        ilike(authUsers.email, `%${keyword}%`),
        sql`${cultivators.id}::text ilike ${`%${keyword}%`}`,
        sql`${cultivators.userId}::text ilike ${`%${keyword}%`}`,
      )!,
    );
  }
  if (realm && REALM_VALUES.includes(realm as (typeof REALM_VALUES)[number])) {
    conditions.push(eq(cultivators.realm, realm));
  }
  if (status) conditions.push(eq(cultivators.status, status));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const q = getExecutor();
  const base = {
    cultivatorId: cultivators.id,
    userId: cultivators.userId,
    name: cultivators.name,
    email: authUsers.email,
    realm: cultivators.realm,
    stage: cultivators.realm_stage,
    status: cultivators.status,
    spiritStones: cultivators.spirit_stones,
    reputation: cultivators.reputation,
    createdAt: cultivators.createdAt,
    lastActiveAt: cultivators.lastActiveAt,
  };
  const [rows, [total]] = await Promise.all([
    q
      .select(base)
      .from(cultivators)
      .innerJoin(authUsers, eq(authUsers.id, cultivators.userId))
      .where(where)
      .orderBy(desc(cultivators.lastActiveAt), desc(cultivators.createdAt))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    q
      .select({ count: count() })
      .from(cultivators)
      .innerJoin(authUsers, eq(authUsers.id, cultivators.userId))
      .where(where),
  ]);
  return c.json({
    success: true,
    players: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt?.toISOString() ?? null,
      lastActiveAt: row.lastActiveAt?.toISOString() ?? null,
    })),
    page,
    pageSize,
    total: Number(total?.count ?? 0),
  });
});

router.get('/:id', requireAdmin(), async (c) => {
  const parsed = IdSchema.safeParse(c.req.param('id'));
  if (!parsed.success) return c.json({ error: '角色 ID 无效' }, 400);
  const id = parsed.data;
  const q = getExecutor();
  const [player] = await q
    .select({
      cultivatorId: cultivators.id,
      userId: cultivators.userId,
      name: cultivators.name,
      email: authUsers.email,
      realm: cultivators.realm,
      stage: cultivators.realm_stage,
      status: cultivators.status,
      spiritStones: cultivators.spirit_stones,
      reputation: cultivators.reputation,
      qi: cultivators.qi,
      age: cultivators.age,
      lifespan: cultivators.lifespan,
      createdAt: cultivators.createdAt,
      lastActiveAt: cultivators.lastActiveAt,
    })
    .from(cultivators)
    .innerJoin(authUsers, eq(authUsers.id, cultivators.userId))
    .where(eq(cultivators.id, id))
    .limit(1);
  if (!player) return c.json({ error: '角色不存在' }, 404);

  const [
    [material],
    [consumable],
    [products],
    taskRows,
    [mail],
    [dungeons],
    [sect],
    events,
  ] = await Promise.all([
    q
      .select({ stacks: count(), quantity: sum(materials.quantity) })
      .from(materials)
      .where(eq(materials.cultivatorId, id)),
    q
      .select({ stacks: count(), quantity: sum(consumables.quantity) })
      .from(consumables)
      .where(eq(consumables.cultivatorId, id)),
    q
      .select({ count: count() })
      .from(creationProducts)
      .where(eq(creationProducts.cultivatorId, id)),
    q
      .select({ status: cultivatorTasks.status, count: count() })
      .from(cultivatorTasks)
      .where(eq(cultivatorTasks.cultivatorId, id))
      .groupBy(cultivatorTasks.status),
    q
      .select({
        count: count(),
        unclaimed: sql<number>`count(*) filter (where ${mails.type} = 'reward' and ${mails.isClaimed} = false)::int`,
      })
      .from(mails)
      .where(eq(mails.cultivatorId, id)),
    q
      .select({ count: count() })
      .from(dungeonHistories)
      .where(eq(dungeonHistories.cultivatorId, id)),
    q
      .select({
        sectId: sectMemberships.sectId,
        contribution: sectMemberships.contribution,
        discipleRank: sectMemberships.discipleRank,
      })
      .from(sectMemberships)
      .where(
        and(
          eq(sectMemberships.cultivatorId, id),
          eq(sectMemberships.status, 'active'),
        ),
      )
      .limit(1),
    q
      .select({
        id: resourceEvents.id,
        resourceKey: resourceEvents.resourceKey,
        operation: resourceEvents.operation,
        eventType: resourceEvents.eventType,
        source: resourceEvents.source,
        createdAt: resourceEvents.createdAt,
      })
      .from(resourceEvents)
      .innerJoin(resourceScopes, eq(resourceScopes.id, resourceEvents.scopeId))
      .where(
        and(
          eq(resourceScopes.scopeKind, 'cultivator'),
          eq(resourceScopes.scopeKey, id),
        ),
      )
      .orderBy(desc(resourceEvents.createdAt))
      .limit(50),
  ]);
  const taskCount = (status: string) =>
    Number(taskRows.find((row) => row.status === status)?.count ?? 0);
  return c.json({
    success: true,
    detail: {
      player: {
        ...player,
        createdAt: player.createdAt?.toISOString() ?? null,
        lastActiveAt: player.lastActiveAt?.toISOString() ?? null,
      },
      inventory: {
        materialStacks: Number(material?.stacks ?? 0),
        materialQuantity: Number(material?.quantity ?? 0),
        consumableStacks: Number(consumable?.stacks ?? 0),
        consumableQuantity: Number(consumable?.quantity ?? 0),
        products: Number(products?.count ?? 0),
      },
      progress: {
        activeTasks: taskCount('active'),
        completedTasks: taskCount('completed'),
        mails: Number(mail?.count ?? 0),
        unclaimedRewardMails: Number(mail?.unclaimed ?? 0),
        dungeonRuns: Number(dungeons?.count ?? 0),
      },
      sect: sect ?? null,
      recentResourceEvents: events.map((event) => ({
        ...event,
        createdAt: event.createdAt.toISOString(),
      })),
    },
  });
});

router.post('/:id/compensate', requireAdmin(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  const body = CompensationSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!id.success || !body.success) {
    return c.json(
      {
        error: '参数错误',
        details: body.success ? undefined : body.error.flatten(),
      },
      400,
    );
  }
  const player = await getExecutor().query.cultivators.findFirst({
    columns: { id: true },
    where: eq(cultivators.id, id.data),
  });
  if (!player) return c.json({ error: '角色不存在' }, 404);
  let attachments;
  try {
    const entries = await findPublishedItemLibraryForSelections(
      body.data.rewardSelections,
    );
    attachments = resolveItemLibrarySelections(
      body.data.rewardSelections,
      entries,
    );
  } catch (error) {
    if (error instanceof ItemLibraryResolveError) {
      return c.json({ error: error.message }, 400);
    }
    throw error;
  }
  const user = c.get('user')!;
  const result = await createAdminBatchJob({
    jobType: 'player_compensation',
    idempotencyKey: body.data.idempotencyKey,
    requestedBy: user.id,
    requestedByEmail: user.email,
    reason: body.data.reason,
    payload: {
      kind: 'game_mail',
      title: body.data.title,
      content: body.data.content,
      attachments,
    },
    targetKeys: [id.data],
  });
  return c.json(
    { success: true, queued: true, created: result.created, job: result.job },
    202,
  );
});

export default router;
