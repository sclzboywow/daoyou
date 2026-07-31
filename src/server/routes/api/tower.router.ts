import { requireActiveCultivatorRef } from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  executeTowerBattleCommand,
  executeTowerBlessingCommand,
  executeTowerProbeCommand,
  executeTowerResetCommand,
  executeTowerStartCommand,
} from '@server/lib/services/TowerApplicationService';
import { towerService } from '@server/lib/tower/service';
import { TOWER_ELIGIBLE_REALMS } from '@shared/lib/tower';
import { Hono } from 'hono';
import { z } from 'zod';
import { readCultivatorRealm } from '@server/lib/services/cultivator/CultivatorFactsReader';

const router = new Hono<AppEnv>();
const battleRouter = new Hono<AppEnv>();

const BlessingSchema = z.object({
  blessingId: z.enum([
    'vitality_surge',
    'spirit_surge',
    'swift_step',
    'mind_focus',
    'jade_bones',
    'sea_of_qi',
    'breathing_technique',
    'meridian_cycle',
    'balanced_dao',
  ]),
});

const BattleIdBodySchema = z.object({
  battleId: z.string().min(1),
});

const BattleIdQuerySchema = z.object({
  battleId: z.string().min(1),
});

const LeaderboardQuerySchema = z.object({
  realm: z.enum(TOWER_ELIGIBLE_REALMS),
  limit: z.coerce.number().int().min(1).max(30).default(30),
});

router.post('/start', requireActiveCultivatorRef(), async (c) => {
  try {
    const cultivator = c.get('activeCultivatorRef');
    if (!cultivator) {
      return c.json({ error: '当前没有活跃角色' }, 404);
    }

    const result = await executeTowerStartCommand({
      cultivatorId: cultivator.cultivatorId,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '开启幻境失败';
    return c.json({ error: message }, 400);
  }
});

router.get('/state', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  const { realm } = await readCultivatorRealm(cultivator.cultivatorId);
  const result = await towerService.getState(
    cultivator.cultivatorId,
    undefined,
    realm,
  );
  return c.json(result);
});

router.post('/reset', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) {
    return c.json({ error: '当前没有活跃角色' }, 404);
  }

  const result = await executeTowerResetCommand({
    cultivatorId: cultivator.cultivatorId,
  });
  return c.json(result);
});

router.post('/blessing/choose', requireActiveCultivatorRef(), async (c) => {
  try {
    const cultivator = c.get('activeCultivatorRef');
    if (!cultivator) {
      return c.json({ error: '当前没有活跃角色' }, 404);
    }

    const { blessingId } = BlessingSchema.parse(await c.req.json());
    const result = await executeTowerBlessingCommand({
      cultivatorId: cultivator.cultivatorId,
      blessingId,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '选择祝福失败';
    return c.json({ error: message }, 400);
  }
});

router.get('/leaderboard', requireActiveCultivatorRef(), async (c) => {
  try {
    const cultivator = c.get('activeCultivatorRef');
    const query = LeaderboardQuerySchema.parse({
      realm: c.req.query('realm'),
      limit: c.req.query('limit'),
    });
    const result = await towerService.getLeaderboard(
      cultivator?.cultivatorId,
      query.realm,
      query.limit,
    );
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '获取塔榜失败';
    return c.json({ error: message }, 400);
  }
});

battleRouter.post('/probe', requireActiveCultivatorRef(), async (c) => {
  try {
    const cultivator = c.get('activeCultivatorRef');
    if (!cultivator) {
      return c.json({ error: '当前没有活跃角色' }, 404);
    }

    const result = await executeTowerProbeCommand({
      cultivatorId: cultivator.cultivatorId,
    });
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '照见幻影失败';
    return c.json({ error: message }, 400);
  }
});

battleRouter.get('/context', requireActiveCultivatorRef(), async (c) => {
  try {
    const cultivator = c.get('activeCultivatorRef');
    if (!cultivator) {
      return c.json({ error: '当前没有活跃角色' }, 404);
    }

    const { battleId } = BattleIdQuerySchema.parse({
      battleId: c.req.query('battleId'),
    });
    const result = await towerService.getBattleContext(cultivator.cultivatorId, battleId);
    return c.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '读取幻境战局失败';
    return c.json({ error: message }, 400);
  }
});

battleRouter.post('/execute/v5', requireActiveCultivatorRef(), async (c) => {
  try {
    const user = c.get('user');
    const cultivator = c.get('activeCultivatorRef');
    if (!user || !cultivator) {
      return c.json({ error: '未授权访问' }, 401);
    }

    const { battleId } = BattleIdBodySchema.parse(await c.req.json());
    const response = await executeTowerBattleCommand({
      userId: user.id,
      cultivatorId: cultivator.cultivatorId,
      battleId,
    });
    return c.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : '幻境战局执行失败';
    return c.json({ error: message }, 400);
  }
});

router.route('/battle', battleRouter);

export default router;
