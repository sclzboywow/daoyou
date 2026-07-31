import {
  redisLockErrorResponse,
  requireActiveCultivatorRef,
} from '@server/lib/hono/middleware';
import { jsonWithStatus } from '@server/lib/hono/response';
import type { AppEnv } from '@server/lib/hono/types';
import {
  abandonIdentityReshape,
  confirmIdentityReshape,
  generateIdentityReshape,
  getIdentityReshapeSession,
  getIdentityReshapeTalismanCount,
  IdentityReshapeServiceError,
  saveIdentityReshapeDraft,
  startIdentityReshape,
} from '@server/lib/services/IdentityReshapeService';
import { toPlayerStateMutationResponse } from '@server/lib/services/ResourceMutationResponse';
import {
  IDENTITY_RESHAPE_DESCRIPTION_MAX_LENGTH,
  IDENTITY_RESHAPE_DESCRIPTION_MIN_LENGTH,
} from '@shared/config/identityReshape';
import { Hono } from 'hono';
import { z } from 'zod';

const AnswerSchema = z.object({
  questionId: z.string().min(1).max(80),
  optionId: z.string().min(1).max(20),
});
const DraftSchema = z.object({
  answers: z.array(AnswerSchema).max(3),
  description: z.string().trim().max(IDENTITY_RESHAPE_DESCRIPTION_MAX_LENGTH),
});
const GenerateSchema = DraftSchema.extend({
  answers: z.array(AnswerSchema).length(3),
  description: z
    .string()
    .trim()
    .min(IDENTITY_RESHAPE_DESCRIPTION_MIN_LENGTH)
    .max(IDENTITY_RESHAPE_DESCRIPTION_MAX_LENGTH),
});

const router = new Hono<AppEnv>();

function respondError(c: Parameters<typeof jsonWithStatus>[0], error: unknown) {
  const lockResponse = redisLockErrorResponse(error);
  if (lockResponse) return lockResponse;
  return jsonWithStatus(
    c,
    {
      success: false,
      error: error instanceof Error ? error.message : '改天换地失败',
    },
    error instanceof IdentityReshapeServiceError ? error.status : 400,
  );
}

router.get('/session', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator)
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  try {
    const [session, talismanCount] = await Promise.all([
      getIdentityReshapeSession(cultivator.cultivatorId),
      getIdentityReshapeTalismanCount(cultivator.cultivatorId),
    ]);
    return c.json({ success: true, data: { session, talismanCount } });
  } catch (error) {
    return respondError(c, error);
  }
});

router.post('/session', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator)
    return c.json({ success: false, error: '未授权访问' }, 401);
  try {
    const result = await startIdentityReshape({
      userId: user.id,
      cultivatorId: cultivator.cultivatorId,
    });
    if (result.committed) {
      return c.json(
        toPlayerStateMutationResponse({
          ...result.committed,
          result: {
            session: result.session,
            talismanCount: result.talismanCount,
          },
        }),
      );
    }
    return c.json({
      success: true,
      data: { session: result.session, talismanCount: result.talismanCount },
    });
  } catch (error) {
    return respondError(c, error);
  }
});

router.patch('/session', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator)
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  const parsed = DraftSchema.safeParse(await c.req.json());
  if (!parsed.success)
    return c.json({ success: false, error: '问答草稿格式错误' }, 400);
  try {
    const session = await saveIdentityReshapeDraft({
      cultivatorId: cultivator.cultivatorId,
      ...parsed.data,
    });
    return c.json({ success: true, data: { session } });
  } catch (error) {
    return respondError(c, error);
  }
});

router.post('/generate', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator)
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  const parsed = GenerateSchema.safeParse(await c.req.json());
  if (!parsed.success)
    return c.json({ success: false, error: '请完成问答并填写身世描述' }, 400);
  try {
    const session = await generateIdentityReshape({
      cultivatorId: cultivator.cultivatorId,
      ...parsed.data,
    });
    return c.json({ success: true, data: { session } });
  } catch (error) {
    return respondError(c, error);
  }
});

router.post('/confirm', requireActiveCultivatorRef(), async (c) => {
  const user = c.get('user');
  const cultivator = c.get('activeCultivatorRef');
  if (!user || !cultivator)
    return c.json({ success: false, error: '未授权访问' }, 401);
  try {
    const committed = await confirmIdentityReshape({
      userId: user.id,
      cultivatorId: cultivator.cultivatorId,
    });
    return c.json(toPlayerStateMutationResponse(committed));
  } catch (error) {
    return respondError(c, error);
  }
});

router.post('/abandon', requireActiveCultivatorRef(), async (c) => {
  const cultivator = c.get('activeCultivatorRef');
  if (!cultivator)
    return c.json({ success: false, error: '当前没有活跃角色' }, 404);
  try {
    await abandonIdentityReshape(cultivator.cultivatorId);
    return c.json({ success: true });
  } catch (error) {
    return respondError(c, error);
  }
});

export default router;
