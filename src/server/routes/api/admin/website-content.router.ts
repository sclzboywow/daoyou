import { requireAdmin } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  getWebsiteContentAdminState,
  publishWebsiteContent,
  resetWebsiteContentDraft,
  rollbackWebsiteContent,
  saveWebsiteContentDraft,
} from '@server/lib/repositories/websiteContentRepository';
import { WebsiteContentSchema } from '@shared/config/websiteContent';
import { Hono } from 'hono';
import { z } from 'zod';

const RollbackSchema = z.object({ versionId: z.string().min(1) });
const router = new Hono<AppEnv>();

router.use('*', requireAdmin());

router.get('/', async (c) => {
  return c.json(await getWebsiteContentAdminState());
});

router.patch('/', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);

  const body = await c.req.json().catch(() => null);
  const parsed = WebsiteContentSchema.safeParse(
    body && typeof body === 'object' && 'content' in body
      ? (body as { content?: unknown }).content
      : null,
  );
  if (!parsed.success) {
    return c.json(
      { error: '官网内容格式不正确', details: parsed.error.flatten() },
      400,
    );
  }

  const draft = await saveWebsiteContentDraft({
    content: parsed.data,
    updatedBy: user.id,
  });
  return c.json({ ok: true, draft });
});

router.post('/publish', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);

  const result = await publishWebsiteContent({ updatedBy: user.id });
  return c.json({ ok: true, ...result });
});

router.post('/rollback', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);

  const parsed = RollbackSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: '请选择需要恢复的历史版本' }, 400);

  const result = await rollbackWebsiteContent({
    versionId: parsed.data.versionId,
    updatedBy: user.id,
  });
  if (!result) return c.json({ error: '历史版本不存在或已被清理' }, 404);

  return c.json({ ok: true, ...result });
});

router.post('/reset-draft', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: '未授权访问' }, 401);

  const draft = await resetWebsiteContentDraft({ updatedBy: user.id });
  return c.json({ ok: true, draft });
});

export default router;
