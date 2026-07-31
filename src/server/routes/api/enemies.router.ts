import { getExecutor } from '@server/lib/drizzle/db';
import { cultivators, spiritualRoots } from '@server/lib/drizzle/schema';
import { requireUser } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { and, eq } from 'drizzle-orm';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

router.get('/:id', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ error: '未授权访问' }, 401);
  }

  const id = c.req.param('id');
  if (!id) {
    return c.json({ error: '请提供有效的敌人ID' }, 400);
  }

  try {
    const q = getExecutor();
    const [enemy] = await q
      .select({
        id: cultivators.id,
        name: cultivators.name,
        realm: cultivators.realm,
        realmStage: cultivators.realm_stage,
        background: cultivators.background,
        vitality: cultivators.vitality,
        spirit: cultivators.spirit,
        wisdom: cultivators.wisdom,
        speed: cultivators.speed,
        willpower: cultivators.willpower,
      })
      .from(cultivators)
      .where(
        and(
          eq(cultivators.id, id),
          eq(cultivators.userId, user.id),
          eq(cultivators.status, 'active'),
        ),
      )
      .limit(1);
    if (!enemy) {
      return c.json({ error: '敌人角色不存在' }, 404);
    }
    const roots = await q
      .select({
        element: spiritualRoots.element,
        strength: spiritualRoots.strength,
        marrowWashBonus: spiritualRoots.marrowWashBonus,
        grade: spiritualRoots.grade,
      })
      .from(spiritualRoots)
      .where(eq(spiritualRoots.cultivatorId, id));
    return c.json({
      success: true,
      data: {
        id: enemy.id,
        name: enemy.name,
        realm: enemy.realm,
        realm_stage: enemy.realmStage,
        spiritual_roots: roots.map((root) => ({
          ...root,
          baseStrength: root.strength,
          strength: root.strength + (root.marrowWashBonus ?? 0),
        })),
        background: enemy.background,
        combatRating: Math.round(
          (enemy.vitality +
            enemy.spirit +
            enemy.wisdom +
            enemy.speed +
            enemy.willpower) /
            5,
        ),
      },
    });
  } catch (error) {
    console.error('获取敌人数据 API 错误:', error);
    const errorMessage =
      process.env.NODE_ENV === 'development'
        ? error instanceof Error
          ? error.message
          : '获取敌人数据失败，请稍后重试'
        : '获取敌人数据失败，请稍后重试';

    return c.json({ error: errorMessage }, 500);
  }
});

export default router;
