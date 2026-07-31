import { requireActiveCultivatorRef } from '@server/lib/hono/middleware';
import { jsonWithStatus } from '@server/lib/hono/response';
import type { AppEnv } from '@server/lib/hono/types';
import {
  LockAcquisitionError,
  RedisLeaseLostError,
} from '@server/lib/redis/lock';
import {
  ManualDrawService,
  ManualDrawServiceError,
} from '@server/lib/services/ManualDrawService';
import { performManualDrawCommand } from '@server/lib/services/ManualDrawApplicationService';
import { toPlayerStateMutationResponse } from '@server/lib/services/ResourceMutationResponse';
import { MANUAL_DRAW_KIND_VALUES } from '@shared/types/manualDraw';
import { Hono } from 'hono';
import { z } from 'zod';

const DrawSchema = z.object({
  kind: z.enum(MANUAL_DRAW_KIND_VALUES),
  count: z.union([z.literal(1), z.literal(5)]),
});

const router = new Hono<AppEnv>();

router.post('/', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator) {
    return c.json({ success: false, error: '未授权访问' }, 401);
  }

  try {
    const parsed = DrawSchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ success: false, error: '请求参数格式错误' }, 400);
    }

    const committed = await performManualDrawCommand({
      userId: user.id,
      cultivatorId: cultivator.cultivatorId,
      kind: parsed.data.kind,
      count: parsed.data.count,
    });
    return c.json(toPlayerStateMutationResponse(committed));
  } catch (error) {
    if (
      error instanceof LockAcquisitionError ||
      error instanceof RedisLeaseLostError
    ) {
      throw error;
    }
    const status = error instanceof ManualDrawServiceError ? error.status : 400;
    return jsonWithStatus(
      c,
      {
        success: false,
        error: error instanceof Error ? error.message : '秘籍抽取失败',
      },
      status,
    );
  }
});

router.get('/status', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) {
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  }

  try {
    const status = await ManualDrawService.getStatus(cultivator.cultivatorId);
    return c.json({
      success: true,
      data: status,
    });
  } catch (error) {
    const status = error instanceof ManualDrawServiceError ? error.status : 400;
    return jsonWithStatus(
      c,
      {
        success: false,
        error: error instanceof Error ? error.message : '获取抽取状态失败',
      },
      status,
    );
  }
});

export default router;
