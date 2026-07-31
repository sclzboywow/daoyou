import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  createAdminActivity,
  disableAdminActivity,
  enableAdminActivity,
  listAdminActivities,
  previewAdminActivity,
  publishAdminActivity,
  updateAdminActivity,
} from '@server/lib/services/AdminActivityService';
import { AdminActivityWriteSchema } from '@shared/contracts/adminPlatform';
import { Hono } from 'hono';
import { z } from 'zod';

const router = new Hono<AppEnv>();
const IdSchema = z.string().uuid();

router.get('/', requireAdmin(), async (c) =>
  c.json({ success: true, activities: await listAdminActivities() }),
);

router.post('/', requireAdmin(), async (c) => {
  const body = AdminActivityWriteSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!body.success) {
    return c.json(
      { error: '参数错误', details: body.error.flatten() },
      400,
    );
  }
  const activity = await createAdminActivity(body.data, c.get('user')!.id);
  return c.json({ success: true, activity }, 201);
});

router.put('/:id', requireAdmin(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  const body = AdminActivityWriteSchema.safeParse(
    await c.req.json().catch(() => null),
  );
  if (!id.success || !body.success) return c.json({ error: '参数错误' }, 400);
  const activity = await updateAdminActivity(
    id.data,
    body.data,
    c.get('user')!.id,
  );
  if (!activity) return c.json({ error: '仅草稿活动可编辑' }, 409);
  return c.json({ success: true, activity });
});

router.post('/:id/preview', requireAdmin(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: '活动 ID 无效' }, 400);
  const preview = await previewAdminActivity(id.data);
  if (!preview) return c.json({ error: '活动不存在' }, 404);
  return c.json({ success: true, preview });
});

router.post('/:id/publish', requireAdmin(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: '活动 ID 无效' }, 400);
  const activity = await publishAdminActivity(id.data, c.get('user')!.id);
  if (!activity) return c.json({ error: '仅草稿活动可发布' }, 409);
  return c.json({ success: true, activity });
});

router.post('/:id/disable', requireAdmin(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: '活动 ID 无效' }, 400);
  const activity = await disableAdminActivity(id.data, c.get('user')!.id);
  if (!activity) return c.json({ error: '当前状态不可停用' }, 409);
  return c.json({ success: true, activity });
});

router.post('/:id/enable', requireAdmin(), async (c) => {
  const id = IdSchema.safeParse(c.req.param('id'));
  if (!id.success) return c.json({ error: '活动 ID 无效' }, 400);
  const activity = await enableAdminActivity(id.data, c.get('user')!.id);
  if (!activity) {
    return c.json({ error: '仅未过期的停用活动可重新开启' }, 409);
  }
  return c.json({ success: true, activity });
});

export default router;
