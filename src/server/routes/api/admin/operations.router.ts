import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { getAdminOperationsSnapshot } from '@server/lib/services/AdminOperationsService';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/', requireAdmin(), async (c) => {
  const snapshot = await getAdminOperationsSnapshot();
  return c.json({ success: true, data: snapshot });
});

export default router;
