import { authAccounts } from '@server/lib/auth/schema';
import { getExecutor, type DbTransaction } from '@server/lib/drizzle/db';
import { and, eq } from 'drizzle-orm';

export const WECHAT_MINI_GAME_PROVIDER_ID = 'wechat-mini-game';

export async function findWechatMiniGameOpenId(
  userId: string,
  tx?: DbTransaction,
): Promise<string | null> {
  const appId = process.env.WECHAT_MINI_GAME_APP_ID?.trim();
  if (!appId) return null;
  const [account] = await getExecutor(tx)
    .select({ accountId: authAccounts.accountId })
    .from(authAccounts)
    .where(
      and(
        eq(authAccounts.userId, userId),
        eq(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
      ),
    )
    .limit(1);
  if (!account) return null;
  const prefix = `${appId}:`;
  return account.accountId.startsWith(prefix)
    ? account.accountId.slice(prefix.length)
    : null;
}
