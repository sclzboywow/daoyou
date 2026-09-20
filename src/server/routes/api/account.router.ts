import { auth } from '@server/lib/auth/auth';
import {
  getValidatedJson,
  requireUser,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  AccountLinkCreateRequestSchema,
  AccountLinkRequestIdSchema,
  AccountLinkRespondRequestSchema,
  type AccountLinkCreateRequest,
  type AccountLinkCreateResponse,
  type AccountLinkRespondRequest,
  type AccountLinkRespondResponse,
  type AccountLinkStatusResponse,
  AccountSetPasswordRequestSchema,
  type AccountSetPasswordRequest,
  type AccountSetPasswordResponse,
} from '@shared/contracts/account';
import {
  AccountLinkError,
  cancelAccountLinkRequest,
  createAccountLinkRequest,
  getAccountLinkStatus,
  respondToAccountLinkRequest,
} from '@server/lib/services/AccountLinkService';
import { Hono, type Context } from 'hono';

const router = new Hono<AppEnv>();

function accountLinkError(c: Context<AppEnv>, error: unknown) {
  if (error instanceof AccountLinkError) {
    return c.json(
      { success: false as const, error: error.message, code: error.code },
      error.status,
    );
  }
  throw error;
}

router.get('/links', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
  try {
    const payload: AccountLinkStatusResponse = {
      success: true,
      data: await getAccountLinkStatus(user.id),
    };
    return c.json(payload);
  } catch (error) {
    return accountLinkError(c, error);
  }
});

router.post(
  '/links',
  requireUser(),
  validateJson(AccountLinkCreateRequestSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
    const { targetUserId } = getValidatedJson<AccountLinkCreateRequest>(c);
    try {
      const payload: AccountLinkCreateResponse = {
        success: true,
        data: await createAccountLinkRequest(user.id, targetUserId),
      };
      return c.json(payload, 201);
    } catch (error) {
      return accountLinkError(c, error);
    }
  },
);

router.post(
  '/links/:requestId/respond',
  requireUser(),
  validateJson(AccountLinkRespondRequestSchema),
  async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
    const requestId = AccountLinkRequestIdSchema.parse(c.req.param('requestId'));
    const { action } = getValidatedJson<AccountLinkRespondRequest>(c);
    try {
      const result = await respondToAccountLinkRequest(user.id, requestId, action);
      const payload: AccountLinkRespondResponse = {
        success: true,
        data: {
          ...result,
          reauthRequired: result.status === 'confirmed',
        },
      };
      return c.json(payload);
    } catch (error) {
      return accountLinkError(c, error);
    }
  },
);

router.delete('/links/:requestId', requireUser(), async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ success: false, error: '未授权访问' }, 401);
  const requestId = AccountLinkRequestIdSchema.parse(c.req.param('requestId'));
  try {
    await cancelAccountLinkRequest(user.id, requestId);
    return c.json({ success: true as const, data: { cancelled: true as const } });
  } catch (error) {
    return accountLinkError(c, error);
  }
});

router.post(
  '/password',
  requireUser(),
  validateJson(AccountSetPasswordRequestSchema),
  async (c) => {
    const { newPassword } = getValidatedJson<AccountSetPasswordRequest>(c);
    const result = await auth.api.setPassword({
      body: { newPassword },
      headers: c.req.raw.headers,
    });

    const payload: AccountSetPasswordResponse = {
      success: true,
      data: {
        status: result.status,
      },
    };

    return c.json(payload);
  },
);

export default router;
