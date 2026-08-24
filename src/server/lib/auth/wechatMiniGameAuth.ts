import { createHmac } from 'node:crypto';
import { APIError, createAuthEndpoint } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

const WECHAT_PROVIDER_ID = 'wechat-mini-game';

const signInBodySchema = z.object({
  code: z.string().trim().min(1).max(256),
});

const codeExchangeSchema = z
  .object({
    openid: z.string().min(1).optional(),
    session_key: z.string().min(1).optional(),
    unionid: z.string().min(1).optional(),
    errcode: z.number().optional(),
    errmsg: z.string().optional(),
  })
  .passthrough();

function requiredWechatConfig() {
  const appId = process.env.WECHAT_MINI_GAME_APP_ID?.trim();
  const appSecret = process.env.WECHAT_MINI_GAME_APP_SECRET?.trim();
  const authSecret = process.env.BETTER_AUTH_SECRET?.trim();

  if (!appId || !appSecret || !authSecret) {
    throw APIError.from('INTERNAL_SERVER_ERROR', {
      code: 'WECHAT_MINI_GAME_NOT_CONFIGURED',
      message: '微信小游戏登录尚未配置',
    });
  }

  return { appId, appSecret, authSecret };
}

async function exchangeWechatCode(
  appId: string,
  appSecret: string,
  code: string,
): Promise<string> {
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    throw APIError.from('BAD_GATEWAY', {
      code: 'WECHAT_CODE_EXCHANGE_UNAVAILABLE',
      message: '微信登录服务暂不可用，请稍后重试',
    });
  }

  if (!response.ok) {
    throw APIError.from('BAD_GATEWAY', {
      code: 'WECHAT_CODE_EXCHANGE_FAILED',
      message: '微信登录服务响应异常',
    });
  }

  const raw = await response.json().catch(() => null);
  const parsed = codeExchangeSchema.safeParse(raw);
  if (!parsed.success || parsed.data.errcode || !parsed.data.openid) {
    throw APIError.from('BAD_REQUEST', {
      code: 'WECHAT_LOGIN_CODE_INVALID',
      message: '微信登录凭证无效或已过期，请重试',
    });
  }

  return parsed.data.openid;
}

function syntheticWechatEmail(
  appId: string,
  openId: string,
  authSecret: string,
): string {
  const digest = createHmac('sha256', authSecret)
    .update(`${appId}:${openId}`)
    .digest('hex');
  return `wechat-${digest.slice(0, 40)}@users.invalid`;
}

export function wechatMiniGameAuth() {
  return {
    id: 'wechat-mini-game-auth',
    endpoints: {
      signInWechatMiniGame: createAuthEndpoint(
        '/sign-in/wechat-mini-game',
        {
          method: 'POST',
          body: signInBodySchema,
        },
        async (ctx) => {
          const { appId, appSecret, authSecret } = requiredWechatConfig();
          const openId = await exchangeWechatCode(
            appId,
            appSecret,
            ctx.body.code,
          );
          const accountId = `${appId}:${openId}`;
          const findWechatAccount = () =>
            ctx.context.adapter.findOne<{ userId: string }>({
              model: 'account',
              where: [
                { field: 'accountId', value: accountId },
                { field: 'providerId', value: WECHAT_PROVIDER_ID },
              ],
            });

          let account = await findWechatAccount();
          let user = account
            ? await ctx.context.internalAdapter.findUserById(account.userId)
            : null;

          if (!user) {
            try {
              const created =
                await ctx.context.internalAdapter.createOAuthUser(
                  {
                    email: syntheticWechatEmail(appId, openId, authSecret),
                    emailVerified: true,
                    name: '微信道友',
                  },
                  // Production still uses Better Auth's pre-issuer account
                  // schema. The adapter ignores the newer type-only field.
                  { accountId, providerId: WECHAT_PROVIDER_ID } as Parameters<
                    typeof ctx.context.internalAdapter.createOAuthUser
                  >[1],
                );
              user = created.user;
            } catch {
              account = await findWechatAccount();
              user = account
                ? await ctx.context.internalAdapter.findUserById(account.userId)
                : null;
              if (!user) {
                throw APIError.from('INTERNAL_SERVER_ERROR', {
                  code: 'WECHAT_ACCOUNT_CREATE_FAILED',
                  message: '微信账号创建失败，请稍后重试',
                });
              }
            }
          }

          const session =
            await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from('INTERNAL_SERVER_ERROR', {
              code: 'WECHAT_SESSION_CREATE_FAILED',
              message: '微信登录会话创建失败',
            });
          }

          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            token: session.token,
            user: {
              id: user.id,
              name: user.name,
            },
          });
        },
      ),
    },
  };
}
