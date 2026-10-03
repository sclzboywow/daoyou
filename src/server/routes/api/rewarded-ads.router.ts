import {
  getValidatedJson,
  getValidatedQuery,
  requireActiveCultivatorRef,
  validateJson,
  validateQuery,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import { toPlayerStateMutationResponse } from '@server/lib/services/ResourceMutationResponse';
import {
  RewardedAdError,
  claimRewardedRecovery,
  prepareRewardedAd,
  readRewardedAdStatus,
  readRewardedAdTicket,
} from '@server/lib/services/RewardedAdApplicationService';
import {
  RewardedAdClaimSchema,
  RewardedAdPrepareSchema,
  RewardedAdStatusQuerySchema,
} from '@shared/contracts/rewardedAds';
import { Hono } from 'hono';
import type { z } from 'zod';
const router = new Hono<AppEnv>();
router.use('*', requireActiveCultivatorRef());
router.use('*', async (c, next) => {
  try {
    await next();
  } catch (error) {
    if (error instanceof RewardedAdError)
      return c.json({ success: false, error: error.message }, 409);
    throw error;
  }
});
router.get('/status', validateQuery(RewardedAdStatusQuerySchema), async (c) =>
  c.json({
    success: true,
    data: await readRewardedAdStatus(
      {
        userId: c.get('user')!.id,
        cultivatorId: c.get('activeCultivatorRef')!.cultivatorId,
      },
      getValidatedQuery<{ battleId?: string }>(c).battleId,
    ),
  }),
);
router.get('/tickets/:id', async (c) => {
  const id = c.req.param('id');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    return c.json({ success: false, error: '凭证格式错误' }, 400);
  return c.json({
    success: true,
    data: await readRewardedAdTicket(
      {
        userId: c.get('user')!.id,
        cultivatorId: c.get('activeCultivatorRef')!.cultivatorId,
      },
      id,
    ),
  });
});
router.post('/prepare', validateJson(RewardedAdPrepareSchema), async (c) => {
  const body = getValidatedJson<z.infer<typeof RewardedAdPrepareSchema>>(c);
  return c.json({
    success: true,
    data: await prepareRewardedAd(
      {
        userId: c.get('user')!.id,
        cultivatorId: c.get('activeCultivatorRef')!.cultivatorId,
      },
      body.placement,
      body.battleId,
    ),
  });
});
router.post('/recovery', validateJson(RewardedAdClaimSchema), async (c) => {
  const body = getValidatedJson<z.infer<typeof RewardedAdClaimSchema>>(c);
  return c.json(
    toPlayerStateMutationResponse<{
      battleId: string;
      hp?: number;
      mp?: number;
      combatRecovery?: boolean;
    }>(
      await claimRewardedRecovery(
        {
          userId: c.get('user')!.id,
          cultivatorId: c.get('activeCultivatorRef')!.cultivatorId,
        },
        body.ticketId,
      ),
    ),
  );
});
export default router;
