import {
  getValidatedJson,
  requireUser,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { redis } from '@server/lib/redis';
import {
  assertUserGeneratedContentSafe,
  ContentSafetyError,
} from '@server/lib/services/ContentSafetyService';
import { Hono } from 'hono';
import { z } from 'zod';

const PreviewSchema = z.object({
  context: z.enum([
    'character',
    'chat',
    'mail',
    'title',
    'craft',
    'identity',
    'taunt',
    'showcase',
    'black_market',
    'feedback',
  ]),
  content: z.string().trim().min(1).max(2_000),
});

const CHECKS_PER_MINUTE = 30;

const router = new Hono<AppEnv>();

router.post('/text', requireUser(), validateJson(PreviewSchema), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
  const input = getValidatedJson<z.infer<typeof PreviewSchema>>(c);

  const minute = Math.floor(Date.now() / 60_000);
  const rateKey = `content-safety:preview-rate:v1:${user.id}:${minute}`;
  try {
    const count = await redis.incr(rateKey);
    if (count === 1) await redis.expire(rateKey, 120);
    if (count > CHECKS_PER_MINUTE) {
      return c.json(
        { success: false, error: '内容审核操作过于频繁，请稍后重试' },
        429,
      );
    }
  } catch (error) {
    console.error('[content-safety] preview rate limiter unavailable', {
      userId: user.id,
      error,
    });
    return c.json({ success: false, error: '内容审核服务暂不可用' }, 503);
  }

  try {
    await assertUserGeneratedContentSafe({
      userId: user.id,
      source: 'wechat_input_preview',
      scene: input.context === 'character' ? 1 : 2,
      content: input.content,
    });
    return c.json({ success: true, data: { approved: true } });
  } catch (error) {
    if (error instanceof ContentSafetyError) {
      return c.json(
        { success: false, error: error.message, code: error.code },
        error.status,
      );
    }
    throw error;
  }
});

export default router;
