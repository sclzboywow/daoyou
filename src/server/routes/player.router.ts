import { db } from '@server/lib/drizzle/db';
import {
  getValidatedQuery,
  requireUser,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  readResourceEventWindow,
  RESOURCE_EVENT_PAGE_LIMIT,
} from '@server/lib/repositories/playerStateRepository';
import { cultivators, sectMemberships } from '@server/lib/drizzle/schema';
import {
  parsePlayerResourceKeys,
  readPlayerResourcesSnapshot,
} from '@server/lib/services/PlayerResourceReaderService';
import type {
  PlayerResourceEventsResponse,
  PlayerResourcesResponse,
} from '@shared/contracts/player';
import {
  RESOURCE_SCOPE_KINDS,
  requiresResourceEventReload,
  type ResourceScope,
} from '@shared/contracts/resources';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
const PlayerResourcesQuerySchema = z.object({
  keys: z.string().min(1).max(256),
});
const PlayerResourceEventsQuerySchema = z.object({
  after: z.coerce.number().int().nonnegative().default(0),
  scopeKind: z.enum(RESOURCE_SCOPE_KINDS),
  scopeId: z.string().min(1).max(128),
});

router.get(
  '/resources',
  requireUser(),
  validateQuery(PlayerResourcesQuerySchema),
  async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
    let keys;
    try {
      keys = parsePlayerResourceKeys(
        getValidatedQuery<{ keys: string }>(c).keys,
      );
    } catch (error) {
      return c.json(
        {
          success: false,
          error: error instanceof Error ? error.message : '玩家资源 keys 无效',
        },
        400,
      );
    }
    const payload: PlayerResourcesResponse = {
      success: true,
      data: await readPlayerResourcesSnapshot({ userId: user.id, keys }),
    };
    return c.json(payload);
  },
);

router.get(
  '/resources/events',
  requireUser(),
  validateQuery(PlayerResourceEventsQuerySchema),
  async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
    const active = await db.query.cultivators.findFirst({
      columns: { id: true },
      where: and(
        eq(cultivators.userId, user.id),
        eq(cultivators.status, 'active'),
      ),
    });
    const { after, scopeKind, scopeId } = getValidatedQuery<{
      after: number;
      scopeKind: ResourceScope['kind'];
      scopeId: string;
    }>(c);
    const scope = { kind: scopeKind, id: scopeId } satisfies ResourceScope;
    if (
      !(await canReadScope(
        { userId: user.id, cultivatorId: active?.id ?? null },
        scope,
      ))
    ) {
      return c.json({ success: false, error: '无权读取该资源作用域' }, 403);
    }
    const window = await readResourceEventWindow(scope, after);
    const requiresReload =
      window.hasIncompatibleEvents ||
      requiresResourceEventReload(window, after, RESOURCE_EVENT_PAGE_LIMIT);
    const payload: PlayerResourceEventsResponse = {
      success: true,
      data: {
        after,
        scope,
        currentScopeVersion: window.currentScopeVersion,
        earliestAvailableVersion: window.earliestAvailableVersion,
        changes: window.changes.slice(0, RESOURCE_EVENT_PAGE_LIMIT),
        requiresReload,
      },
    };
    return c.json(payload);
  },
);

export default router;

async function canReadScope(
  ref: { userId: string; cultivatorId: string | null },
  scope: ResourceScope,
): Promise<boolean> {
  if (scope.kind === 'account') return scope.id === ref.userId;
  if (scope.kind === 'cultivator') {
    return Boolean(ref.cultivatorId && scope.id === ref.cultivatorId);
  }
  if (scope.kind === 'global') return scope.id === 'global';
  if (!ref.cultivatorId) return false;
  const membership = await db.query.sectMemberships.findFirst({
    columns: { id: true },
    where: and(
      eq(sectMemberships.cultivatorId, ref.cultivatorId),
      eq(sectMemberships.sectId, scope.id),
      eq(sectMemberships.status, 'active'),
    ),
  });
  return Boolean(membership);
}
