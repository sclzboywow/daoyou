import {
  getValidatedJson,
  requireActiveCultivatorRef,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  getWechatOpenAbilities,
  subscribeQiFullReminder,
  WechatOpenAbilityError,
} from '@server/lib/services/WechatQiSubscriptionService';
import { QiFullSubscriptionSchema } from '@shared/contracts/wechatSubscriptions';
import { Hono } from 'hono';
import type { z } from 'zod';

const router = new Hono<AppEnv>();
// Scope the guards to these endpoints: the ad callback sharing /wechat is public.
router.use('/open-abilities', requireActiveCultivatorRef());
router.use('/subscriptions/*', requireActiveCultivatorRef());
router.get('/open-abilities', async (c) => {
  try {
    return c.json({
      success: true,
      data: await getWechatOpenAbilities({
        userId: c.get('user')!.id,
        cultivatorId: c.get('activeCultivatorRef')!.cultivatorId,
      }),
    });
  } catch (error) {
    if (error instanceof WechatOpenAbilityError)
      return c.json(
        { success: false, error: error.message, code: error.code },
        error.status,
      );
    throw error;
  }
});
router.post(
  '/subscriptions/qi-full',
  validateJson(QiFullSubscriptionSchema),
  async (c) => {
    try {
      const body =
        getValidatedJson<z.infer<typeof QiFullSubscriptionSchema>>(c);
      return c.json({
        success: true,
        data: await subscribeQiFullReminder({
          actor: {
            userId: c.get('user')!.id,
            cultivatorId: c.get('activeCultivatorRef')!.cultivatorId,
          },
          templateId: body.templateId,
        }),
      });
    } catch (error) {
      if (error instanceof WechatOpenAbilityError)
        return c.json(
          { success: false, error: error.message, code: error.code },
          error.status,
        );
      throw error;
    }
  },
);
export default router;
