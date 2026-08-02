import { requireActiveCultivatorRef } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  claimLoginActivity,
  listPlayerActivities,
} from '@server/lib/services/AdminActivityService';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
const IdSchema = z.string().uuid();

router.get('/', requireActiveCultivatorRef(), async (c) => {
  const ref = c.get('activeCultivatorRef')!;
  return c.json({
    success: true,
    activities: await listPlayerActivities(ref.cultivatorId),
  });
});

router.post('/:id/claim', requireActiveCultivatorRef(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: '活动 ID 无效' }, 400);
  try {
    const result = await claimLoginActivity(
      id.data,
      c.get('activeCultivatorRef')!.cultivatorId,
    );
    return c.json({ success: true, ...result });
  } catch (error) {
    return c.json(
      { error: error instanceof Error ? error.message : '领取失败' },
      409,
    );
  }
});

export default router;
