import { auth } from '@server/lib/auth/auth';
import {
  getValidatedJson,
  requireUser,
  validateJson,
} from '@server/lib/hono/middleware';
import type { AppEnv } from '@server/lib/hono/types';
import {
  AccountSetPasswordRequestSchema,
  type AccountSetPasswordRequest,
  type AccountSetPasswordResponse,
} from '@shared/contracts/account';
import { Hono } from 'hono';

const router = new Hono<AppEnv>();

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
