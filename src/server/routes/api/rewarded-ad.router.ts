import {
  getValidatedJson,
  redisLockErrorResponse,
  requireActiveCultivatorRef,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  DungeonFlowError,
  dungeonService,
} from '@server/lib/dungeon/service_v2';
import { Hono } from 'hono';
import { z } from 'zod';
import {
  consumeRewardedAdCredit,
  releaseRewardedAdCredit,
  reserveRewardedAdCredit,
  RewardedAdVerificationError,
} from '@server/lib/services/RewardedAdVerificationService';

const runSchema = z
  .object({
    runId: z.uuid(),
  })
  .strict();

const router = new Hono<AppEnv>();
router.use('*', requireActiveCultivatorRef());

router.post('/battle-heal', validateJson(runSchema), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) return c.json({ success: false, error: '未授权访问' }, 401);
  const { runId } = getValidatedJson<z.infer<typeof runSchema>>(c);
  const requestId = c.req.header('Idempotency-Key')?.trim();
  if (!requestId || requestId.length < 8 || requestId.length > 120) {
    return c.json({ success: false, error: '广告奖励领取凭证无效' }, 400);
  }
  let reservation;
  try {
    reservation = await reserveRewardedAdCredit({
      userId: cultivator.userId,
      cultivatorId: cultivator.cultivatorId,
      rewardKind: 'battle-heal',
      requestId,
    });
    const result = await dungeonService.applyRewardedBattleHeal(
      cultivator.cultivatorId,
      runId,
    );
    await consumeRewardedAdCredit(reservation);
    return c.json({ success: true, ...result });
  } catch (error) {
    if (reservation) await releaseRewardedAdCredit(reservation);
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof DungeonFlowError) {
      return c.json(
        { success: false, error: error.message, code: error.code },
        error.status,
      );
    }
    if (error instanceof RewardedAdVerificationError) {
      return c.json(
        { success: false, error: error.message, code: error.code },
        error.status,
      );
    }
    throw error;
  }
});

router.post('/battle-heal/decline', validateJson(runSchema), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator) return c.json({ success: false, error: '未授权访问' }, 401);
  const { runId } = getValidatedJson<z.infer<typeof runSchema>>(c);
  try {
    const result = await dungeonService.declineRewardedBattleHeal(
      cultivator.cultivatorId,
      runId,
    );
    return c.json({ success: true, ...result });
  } catch (error) {
    const lockErrorResponse = redisLockErrorResponse(error);
    if (lockErrorResponse) return lockErrorResponse;
    if (error instanceof DungeonFlowError) {
      return c.json(
        { success: false, error: error.message, code: error.code },
        error.status,
      );
    }
    throw error;
  }
});

export default router;
