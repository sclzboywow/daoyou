import {
  getValidatedJson,
  requireActiveCultivatorRef,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  claimWechatShareGift,
  createWechatShareGift,
  getWechatOpenAbilities,
  getWechatShareGiftPreview,
  subscribeQiFullReminder,
  WechatOpenAbilityError,
} from '@server/lib/services/WechatOpenAbilityService';
import { Hono, type Context } from 'hono';
import { z } from 'zod';

const subscribeSchema = z
  .object({
    templateId: z.string().trim().min(1).max(128),
  })
  .strict();

const giftIdSchema = z.uuid();

const router = new Hono<AppEnv>();
router.use('*', requireActiveCultivatorRef());

function actorFromContext(c: Context<AppEnv>) {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator) return null;
  return { userId: user.id, cultivatorId: cultivator.cultivatorId };
}

function handleAbilityError(c: Context<AppEnv>, error: unknown) {
  if (error instanceof WechatOpenAbilityError) {
    return c.json(
      { success: false, error: error.message, code: error.code },
      error.status,
    );
  }
  throw error;
}

router.get('/open-abilities', async (c) => {
  const actor = actorFromContext(c);
  if (!actor) return c.json({ success: false, error: '未授权访问' }, 401);
  try {
    return c.json({ success: true, data: await getWechatOpenAbilities(actor) });
  } catch (error) {
    return handleAbilityError(c, error);
  }
});

router.post(
  '/subscriptions/qi-full',
  validateJson(subscribeSchema),
  async (c) => {
    const actor = actorFromContext(c);
    if (!actor) return c.json({ success: false, error: '未授权访问' }, 401);
    try {
      const body = getValidatedJson<z.infer<typeof subscribeSchema>>(c);
      return c.json({
        success: true,
        data: await subscribeQiFullReminder({ actor, templateId: body.templateId }),
      });
    } catch (error) {
      return handleAbilityError(c, error);
    }
  },
);

router.post('/share-gifts', async (c) => {
  const actor = actorFromContext(c);
  if (!actor) return c.json({ success: false, error: '未授权访问' }, 401);
  try {
    return c.json({ success: true, data: await createWechatShareGift(actor) });
  } catch (error) {
    return handleAbilityError(c, error);
  }
});

router.get('/share-gifts/:giftId', async (c) => {
  const actor = actorFromContext(c);
  if (!actor) return c.json({ success: false, error: '未授权访问' }, 401);
  const parsed = giftIdSchema.safeParse(c.req.param('giftId'));
  if (!parsed.success) {
    return c.json({ success: false, error: '机缘编号无效' }, 400);
  }
  try {
    return c.json({
      success: true,
      data: await getWechatShareGiftPreview(actor, parsed.data),
    });
  } catch (error) {
    return handleAbilityError(c, error);
  }
});

router.post('/share-gifts/:giftId/claim', async (c) => {
  const actor = actorFromContext(c);
  if (!actor) return c.json({ success: false, error: '未授权访问' }, 401);
  const parsed = giftIdSchema.safeParse(c.req.param('giftId'));
  if (!parsed.success) {
    return c.json({ success: false, error: '机缘编号无效' }, 400);
  }
  try {
    return c.json({
      success: true,
      data: await claimWechatShareGift({ actor, giftId: parsed.data }),
    });
  } catch (error) {
    return handleAbilityError(c, error);
  }
});

export default router;
