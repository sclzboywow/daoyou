import { requireActiveCultivatorRef } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { readResourceWithMeta } from '@server/lib/services/ResourceReadService';
import { toPlayerStateMutationResponse } from '@server/lib/services/ResourceMutationResponse';
import { getPlayerIdentityCultivatorById } from '@server/lib/services/cultivator/CultivatorProfileRepository';
import {
  completeStoryGuideCommand,
  completeStoryPerformanceCommand,
} from '@server/lib/services/StoryApplicationService';
import { StoryService } from '@server/lib/services/StoryService';
import { getPerformanceScript } from '@shared/performance/catalog';
import { fillPerformanceScript } from '@shared/performance/schema';
import { Hono } from 'hono';
import { z } from 'zod';

const CompleteSchema = z
  .object({
    outcome: z.string().trim().min(1).max(40),
  })
  .strict();

const router = new Hono<AppEnv>();

router.get('/', requireActiveCultivatorRef(), async (c) => {
  const ref = c.get('activeCultivatorRef');
  if (!ref) return c.json({ error: '当前没有活跃角色' }, 404);
  return c.json(
    await readResourceWithMeta(
      { kind: 'cultivator', id: ref.cultivatorId },
      'player.story',
      (tx) => StoryService.read(ref.cultivatorId, tx),
    ),
  );
});

/**
 * Return only the performance that is currently authoritative for this player.
 * This keeps narrative content server-owned while non-Web clients can render it.
 */
router.get('/performances/:scriptId', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const ref = c.get('activeCultivatorRef');
  if (!user || !ref) return c.json({ error: '当前没有活跃角色' }, 404);
  const scriptId = c.req.param('scriptId');
  const currentResponse = await readResourceWithMeta(
    { kind: 'cultivator', id: ref.cultivatorId },
    'player.story',
    (tx) => StoryService.read(ref.cultivatorId, tx),
  );
  const current = currentResponse.data;
  if (current.kind !== 'performance' || current.scriptId !== scriptId) {
    return c.json({ error: '当前没有这场演出' }, 404);
  }
  const cultivator = await getPlayerIdentityCultivatorById(
    user.id,
    ref.cultivatorId,
  );
  if (!cultivator) return c.json({ error: '角色不存在' }, 404);
  try {
    const script = fillPerformanceScript(getPerformanceScript(scriptId), {
      name: cultivator.name,
      background: cultivator.background?.trim() || '尚无来处',
    });
    return c.json({ success: true, data: script });
  } catch (error) {
    console.error('story performance read failed:', error);
    return c.json({ error: '玉简演出暂时无法展开' }, 500);
  }
});

router.post('/performances/:scriptId/complete', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const ref = c.get('activeCultivatorRef');
  if (!user || !ref) return c.json({ error: '当前没有活跃角色' }, 404);
  const scriptId = c.req.param('scriptId');
  const parsed = CompleteSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0]?.message || '演出结果无效' },
      400,
    );
  }
  const { outcome } = parsed.data;

  try {
    const committed = await completeStoryPerformanceCommand({
      userId: user.id,
      cultivatorId: ref.cultivatorId,
      scriptId,
      outcome,
    });
    return c.json(toPlayerStateMutationResponse(committed));
  } catch (error) {
    const message = error instanceof Error ? error.message : '演出没能记下';
    const status = message.includes('当前没有这场演出') ? 409 : 400;
    return c.json({ error: message }, status);
  }
});

router.post('/guides/:lessonId/complete', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const ref = c.get('activeCultivatorRef');
  if (!user || !ref) return c.json({ error: '当前没有活跃角色' }, 404);
  const lessonId = c.req.param('lessonId');
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(lessonId) || lessonId.length > 80) {
    return c.json({ error: '没有这场教学' }, 404);
  }

  try {
    const committed = await completeStoryGuideCommand({
      userId: user.id,
      cultivatorId: ref.cultivatorId,
      lessonId,
    });
    return c.json(toPlayerStateMutationResponse(committed));
  } catch (error) {
    const message = error instanceof Error ? error.message : '这课没能记下';
    const status = message.includes('当前没有这场教学')
      ? 409
      : message.includes('没有这场教学')
        ? 404
        : 400;
    return c.json({ error: message }, status);
  }
});

export default router;
