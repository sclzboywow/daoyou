import { requireUser } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { isRedisLockContention } from '@server/lib/redis/lock';
import { deleteCultivatorCommand } from '@server/lib/services/CultivatorProfileApplicationService';
import {
  getLastDeadCultivatorSummary,
} from '@server/lib/services/cultivator/CultivatorProfileRepository';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.delete('/', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const cultivatorId = c.req.query('id');
  if (!cultivatorId) {
    return c.json({ error: '请提供角色ID' }, 400);
  }

  try {
    const success = await deleteCultivatorCommand({
      userId: user.id,
      cultivatorId,
    });
    if (!success) {
      return c.json({ error: '删除角色失败或角色不存在' }, 404);
    }
    return c.json({
      success: true,
      message: '角色删除成功',
    });
  } catch (error) {
    if (isRedisLockContention(error)) {
      return c.json({ error: '角色正在执行其他操作，请稍后重试' }, 429);
    }
    throw error;
  }
});

router.get('/reincarnate-context', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  try {
    const summary = await getLastDeadCultivatorSummary(user.id);
    return c.json({
      success: true,
      data: summary ?? null,
    });
  } catch (err) {
    console.error('获取转世上下文 API 错误:', err);
    return c.json(
      {
        error:
          process.env.NODE_ENV === 'development'
            ? err instanceof Error
              ? err.message
              : '获取转世上下文失败'
            : '获取转世上下文失败，请稍后再试',
      },
      500,
    );
  }
});

export default router;
