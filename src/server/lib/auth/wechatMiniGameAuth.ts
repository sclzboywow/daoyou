import { createHmac } from 'node:crypto';
import { authAccounts } from '@server/lib/auth/schema';
import { db, getExecutor, type DbTransaction } from '@server/lib/drizzle/db';
import { and, eq, sql } from 'drizzle-orm';
import { APIError, createAuthEndpoint, sessionMiddleware } from 'better-auth/api';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod';

export const WECHAT_MINI_GAME_PROVIDER_ID = 'wechat-mini-game';

const loginBodySchema = z.object({
  code: z.string().trim().min(1).max(256),
});

const signUpBodySchema = loginBodySchema.extend({
  name: z.string().trim().min(1).max(32),
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
): Promise<{ openId: string; unionId?: string }> {
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

  return {
    openId: parsed.data.openid,
    ...(parsed.data.unionid ? { unionId: parsed.data.unionid } : {}),
  };
}

function accountIdFor(appId: string, openId: string) {
  return `${appId}:${openId}`;
}

async function findWechatAccount(
  accountId: string,
  tx?: DbTransaction,
): Promise<{ userId: string; accountId: string } | null> {
  const [account] = await getExecutor(tx)
    .select({
      userId: authAccounts.userId,
      accountId: authAccounts.accountId,
    })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
        eq(authAccounts.accountId, accountId),
      ),
    )
    .limit(1);

  return account ?? null;
}

async function findUserWechatAccount(
  userId: string,
  tx?: DbTransaction,
): Promise<{ userId: string; accountId: string } | null> {
  const [account] = await getExecutor(tx)
    .select({
      userId: authAccounts.userId,
      accountId: authAccounts.accountId,
    })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
        eq(authAccounts.userId, userId),
      ),
    )
    .limit(1);

  return account ?? null;
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

/**
 * Consume a fresh wx.login code as proof that an auth request comes from the
 * configured mini game. A wx.login code is short-lived and single-use, so the
 * client must request a new code for every protected email-auth request.
 */
export async function verifyWechatMiniGameLoginCode(code: string): Promise<void> {
  const parsed = loginBodySchema.safeParse({ code });
  if (!parsed.success) {
    throw APIError.from('BAD_REQUEST', {
      code: 'WECHAT_LOGIN_CODE_INVALID',
      message: '微信登录凭证无效或已过期，请重试',
    });
  }

  const { appId, appSecret } = requiredWechatConfig();
  await exchangeWechatCode(appId, appSecret, parsed.data.code);
}

export function wechatMiniGameAuth() {
  return {
    id: 'wechat-mini-game-auth',
    endpoints: {
      signInWechatMiniGame: createAuthEndpoint(
        '/sign-in/wechat-mini-game',
        {
          method: 'POST',
          body: loginBodySchema,
        },
        async (ctx) => {
          const { appId, appSecret } = requiredWechatConfig();
          const { openId } = await exchangeWechatCode(
            appId,
            appSecret,
            ctx.body.code,
          );
          const account = await findWechatAccount(accountIdFor(appId, openId));

          if (!account) {
            throw APIError.from('NOT_FOUND', {
              code: 'WECHAT_ACCOUNT_UNLINKED',
              message: '当前微信尚未绑定云梦界账号',
            });
          }

          const user = await ctx.context.internalAdapter.findUserById(
            account.userId,
          );
          if (!user) {
            throw APIError.from('INTERNAL_SERVER_ERROR', {
              code: 'WECHAT_ACCOUNT_USER_MISSING',
              message: '微信账号状态异常，请联系管理员',
            });
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from('INTERNAL_SERVER_ERROR', {
              code: 'WECHAT_SESSION_CREATE_FAILED',
              message: '微信登录会话创建失败',
            });
          }
          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            token: session.token,
            user: { id: user.id, name: user.name },
            isNewUser: false,
          });
        },
      ),

      signUpWechatMiniGame: createAuthEndpoint(
        '/sign-up/wechat-mini-game',
        {
          method: 'POST',
          body: signUpBodySchema,
        },
        async (ctx) => {
          const { appId, appSecret, authSecret } = requiredWechatConfig();
          const { openId } = await exchangeWechatCode(
            appId,
            appSecret,
            ctx.body.code,
          );
          const accountId = accountIdFor(appId, openId);
          const existing = await findWechatAccount(accountId);
          if (existing) {
            throw APIError.from('CONFLICT', {
              code: 'WECHAT_ACCOUNT_ALREADY_LINKED',
              message: '当前微信已经绑定账号，请直接登录',
            });
          }

          let user = null;
          try {
            const created = await ctx.context.internalAdapter.createOAuthUser(
              {
                email: syntheticWechatEmail(appId, openId, authSecret),
                emailVerified: true,
                name: ctx.body.name,
              },
              {
                accountId,
                providerId: WECHAT_MINI_GAME_PROVIDER_ID,
              },
            );
            user = created.user;
          } catch {
            // Recover a duplicate request if another instance created the same
            // WeChat account first.
            const raced = await findWechatAccount(accountId);
            user = raced
              ? await ctx.context.internalAdapter.findUserById(raced.userId)
              : null;
            if (!user) {
              throw APIError.from('INTERNAL_SERVER_ERROR', {
                code: 'WECHAT_ACCOUNT_CREATE_FAILED',
                message: '微信账号创建失败，请稍后重试',
              });
            }
          }

          const session = await ctx.context.internalAdapter.createSession(user.id);
          if (!session) {
            throw APIError.from('INTERNAL_SERVER_ERROR', {
              code: 'WECHAT_SESSION_CREATE_FAILED',
              message: '微信登录会话创建失败',
            });
          }
          await setSessionCookie(ctx, { session, user });

          return ctx.json({
            token: session.token,
            user: { id: user.id, name: user.name },
            isNewUser: true,
          });
        },
      ),

      linkWechatMiniGame: createAuthEndpoint(
        '/link/wechat-mini-game',
        {
          method: 'POST',
          body: loginBodySchema,
          use: [sessionMiddleware],
        },
        async (ctx) => {
          const session = ctx.context.session;
          if (!session?.user?.id) {
            throw APIError.from('UNAUTHORIZED', {
              code: 'WECHAT_LINK_REQUIRES_SESSION',
              message: '请先登录已有账号',
            });
          }

          const { appId, appSecret } = requiredWechatConfig();
          const { openId } = await exchangeWechatCode(
            appId,
            appSecret,
            ctx.body.code,
          );
          const accountId = accountIdFor(appId, openId);
          const userId = session.user.id;

          const result = await db.transaction(async (tx) => {
            // Serialise linking of the same identity across multiple Hono
            // instances. This keeps Web and WeChat in one data/lock domain.
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtext(${WECHAT_MINI_GAME_PROVIDER_ID}), hashtext(${accountId}))`,
            );
            await tx.execute(
              sql`select pg_advisory_xact_lock(hashtext('wechat-mini-game-user'), hashtext(${userId}))`,
            );

            const identity = await findWechatAccount(accountId, tx);
            if (identity && identity.userId !== userId) {
              throw APIError.from('CONFLICT', {
                code: 'WECHAT_IDENTITY_BOUND_TO_OTHER_USER',
                message: '当前微信已经绑定其他账号',
              });
            }

            const current = await findUserWechatAccount(userId, tx);
            if (current && current.accountId !== accountId) {
              throw APIError.from('CONFLICT', {
                code: 'USER_ALREADY_HAS_WECHAT_IDENTITY',
                message: '当前账号已经绑定其他微信身份',
              });
            }

            if (!identity) {
              const now = new Date();
              await tx.insert(authAccounts).values({
                accountId,
                providerId: WECHAT_MINI_GAME_PROVIDER_ID,
                userId,
                createdAt: now,
                updatedAt: now,
              });
            }

            return { linked: true } as const;
          });

          return ctx.json(result);
        },
      ),
    },
  };
}
