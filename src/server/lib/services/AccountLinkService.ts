import { authAccounts, authSessions, authUsers } from '@server/lib/auth/schema';
import { WECHAT_MINI_GAME_PROVIDER_ID } from '@server/lib/auth/wechatMiniGameIdentity';
import { db, type DbTransaction } from '@server/lib/drizzle/db';
import { accountLinkRequests, cultivators } from '@server/lib/drizzle/schema';
import type {
  AccountLinkIdentitySummary,
  AccountLinkRequestSummary,
  AccountLinkStatusData,
} from '@shared/contracts/account';
import { and, desc, eq, lt, ne, or, sql } from 'drizzle-orm';

const LINK_TTL_MS = 10 * 60 * 1000;

export class AccountLinkError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
  ) {
    super(message);
    this.name = 'AccountLinkError';
  }
}

interface IdentityRecord {
  user: typeof authUsers.$inferSelect;
  accounts: Array<typeof authAccounts.$inferSelect>;
  cultivator: {
    id: string;
    name: string;
    realm: string;
  } | null;
}

function hasWechatIdentity(identity: IdentityRecord): boolean {
  return identity.accounts.some(
    (account) => account.providerId === WECHAT_MINI_GAME_PROVIDER_ID,
  );
}

function hasPcIdentity(identity: IdentityRecord): boolean {
  return !identity.user.email.endsWith('@users.invalid');
}

function identitySummary(identity: IdentityRecord): AccountLinkIdentitySummary {
  return {
    userId: identity.user.id,
    name: identity.user.name,
    platform: hasWechatIdentity(identity) ? 'wechat' : 'pc',
    cultivator: identity.cultivator,
  };
}

async function readIdentity(
  tx: DbTransaction,
  userId: string,
  lock = false,
): Promise<IdentityRecord | null> {
  const userQuery = tx.select().from(authUsers).where(eq(authUsers.id, userId));
  const [user] = lock
    ? await userQuery.for('update').limit(1)
    : await userQuery.limit(1);
  if (!user) return null;

  const accounts = await tx
    .select()
    .from(authAccounts)
    .where(eq(authAccounts.userId, userId))
    .orderBy(authAccounts.createdAt);
  const [cultivator] = await tx
    .select({
      id: cultivators.id,
      name: cultivators.name,
      realm: cultivators.realm,
    })
    .from(cultivators)
    .where(eq(cultivators.userId, userId))
    .orderBy(desc(cultivators.updatedAt), desc(cultivators.createdAt))
    .limit(1);

  return { user, accounts, cultivator: cultivator ?? null };
}

async function expireRequests(tx: DbTransaction, now: Date): Promise<void> {
  await tx
    .update(accountLinkRequests)
    .set({ status: 'expired', respondedAt: now, updatedAt: now })
    .where(
      and(
        eq(accountLinkRequests.status, 'pending'),
        lt(accountLinkRequests.expiresAt, now),
      ),
    );
}

function toRequestSummary(
  request: typeof accountLinkRequests.$inferSelect,
  currentUserId: string,
  counterpart: IdentityRecord,
): AccountLinkRequestSummary {
  return {
    id: request.id,
    direction:
      request.requesterUserId === currentUserId ? 'outgoing' : 'incoming',
    status: request.status,
    counterpart: identitySummary(counterpart),
    expiresAt: request.expiresAt.toISOString(),
    createdAt: request.createdAt.toISOString(),
  };
}

function ensureCrossPlatform(
  requester: IdentityRecord,
  target: IdentityRecord,
): void {
  if (hasWechatIdentity(requester) === hasWechatIdentity(target)) {
    throw new AccountLinkError(
      '只能在 PC 账号与微信小游戏账号之间互绑',
      409,
      'ACCOUNT_LINK_PLATFORM_MISMATCH',
    );
  }
  if (
    (hasWechatIdentity(requester) && hasPcIdentity(requester)) ||
    (hasWechatIdentity(target) && hasPcIdentity(target))
  ) {
    throw new AccountLinkError(
      '其中一个账号已经完成跨端互通',
      409,
      'ACCOUNT_ALREADY_LINKED',
    );
  }
}

export async function getAccountLinkStatus(
  userId: string,
): Promise<AccountLinkStatusData> {
  return db.transaction(async (tx) => {
    const now = new Date();
    const identity = await readIdentity(tx, userId);
    if (!identity) {
      throw new AccountLinkError('账号不存在', 404, 'ACCOUNT_NOT_FOUND');
    }
    const rows = await tx
      .select()
      .from(accountLinkRequests)
      .where(
        and(
          eq(accountLinkRequests.status, 'pending'),
          sql`${accountLinkRequests.expiresAt} > ${now}`,
          or(
            eq(accountLinkRequests.requesterUserId, userId),
            eq(accountLinkRequests.targetUserId, userId),
          ),
        ),
      )
      .orderBy(desc(accountLinkRequests.createdAt));
    const requests: AccountLinkRequestSummary[] = [];
    for (const row of rows) {
      const counterpartId =
        row.requesterUserId === userId ? row.targetUserId : row.requesterUserId;
      const counterpart = await readIdentity(tx, counterpartId);
      if (counterpart) {
        requests.push(toRequestSummary(row, userId, counterpart));
      }
    }
    const hasWechat = hasWechatIdentity(identity);
    const hasPc = hasPcIdentity(identity);
    return {
      userId,
      linked: hasWechat && hasPc,
      hasPcIdentity: hasPc,
      hasWechatIdentity: hasWechat,
      requests,
    };
  });
}

export async function createAccountLinkRequest(
  requesterUserId: string,
  targetUserId: string,
): Promise<AccountLinkRequestSummary> {
  if (requesterUserId === targetUserId) {
    throw new AccountLinkError(
      '当前账号无需与自身绑定',
      400,
      'ACCOUNT_LINK_SELF',
    );
  }
  return db.transaction(async (tx) => {
    const now = new Date();
    for (const id of [requesterUserId, targetUserId].sort()) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`account-link:${id}`}))`,
      );
    }
    await expireRequests(tx, now);
    const requester = await readIdentity(tx, requesterUserId, true);
    const target = await readIdentity(tx, targetUserId, true);
    if (!requester || !target) {
      throw new AccountLinkError(
        '未找到对方账号，请核对用户 ID',
        404,
        'ACCOUNT_LINK_TARGET_NOT_FOUND',
      );
    }
    ensureCrossPlatform(requester, target);

    const [active] = await tx
      .select({ id: accountLinkRequests.id })
      .from(accountLinkRequests)
      .where(
        and(
          eq(accountLinkRequests.status, 'pending'),
          or(
            eq(accountLinkRequests.requesterUserId, requesterUserId),
            eq(accountLinkRequests.targetUserId, requesterUserId),
            eq(accountLinkRequests.requesterUserId, targetUserId),
            eq(accountLinkRequests.targetUserId, targetUserId),
          ),
        ),
      )
      .limit(1);
    if (active) {
      throw new AccountLinkError(
        '任一账号已有待处理的互绑申请',
        409,
        'ACCOUNT_LINK_REQUEST_EXISTS',
      );
    }

    const [created] = await tx
      .insert(accountLinkRequests)
      .values({
        requesterUserId,
        targetUserId,
        expiresAt: new Date(now.getTime() + LINK_TTL_MS),
      })
      .returning();
    return toRequestSummary(created, requesterUserId, target);
  });
}

export async function cancelAccountLinkRequest(
  userId: string,
  requestId: string,
): Promise<void> {
  const [updated] = await db
    .update(accountLinkRequests)
    .set({
      status: 'cancelled',
      respondedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(accountLinkRequests.id, requestId),
        eq(accountLinkRequests.requesterUserId, userId),
        eq(accountLinkRequests.status, 'pending'),
      ),
    )
    .returning({ id: accountLinkRequests.id });
  if (!updated) {
    throw new AccountLinkError(
      '待取消的互绑申请不存在',
      404,
      'ACCOUNT_LINK_REQUEST_NOT_FOUND',
    );
  }
}

async function mergeIdentities(
  tx: DbTransaction,
  requester: IdentityRecord,
  target: IdentityRecord,
): Promise<string> {
  ensureCrossPlatform(requester, target);
  if (requester.cultivator && target.cultivator) {
    throw new AccountLinkError(
      '两个账号均已有角色，暂不能自动合并，请联系管理员处理',
      409,
      'ACCOUNT_LINK_PROGRESS_CONFLICT',
    );
  }

  const wechat = hasWechatIdentity(requester) ? requester : target;
  const pc = wechat.user.id === requester.user.id ? target : requester;
  const primary = wechat.cultivator ? wechat : pc;
  const secondary = primary.user.id === requester.user.id ? target : requester;
  const now = new Date();
  let copyPcProfile = false;

  if (primary.user.id === pc.user.id) {
    await tx
      .delete(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, wechat.user.id),
          ne(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
        ),
      );
    await tx
      .update(authAccounts)
      .set({ userId: pc.user.id, updatedAt: now })
      .where(
        and(
          eq(authAccounts.userId, wechat.user.id),
          eq(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
        ),
      );
  } else {
    await tx
      .delete(authAccounts)
      .where(
        and(
          eq(authAccounts.userId, wechat.user.id),
          ne(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
        ),
      );
    await tx
      .update(authAccounts)
      .set({ userId: wechat.user.id, updatedAt: now })
      .where(
        and(
          eq(authAccounts.userId, pc.user.id),
          ne(authAccounts.providerId, WECHAT_MINI_GAME_PROVIDER_ID),
        ),
      );
    copyPcProfile = true;
  }

  await tx
    .delete(authSessions)
    .where(eq(authSessions.userId, secondary.user.id));
  await tx
    .delete(authAccounts)
    .where(eq(authAccounts.userId, secondary.user.id));
  await tx.delete(authUsers).where(eq(authUsers.id, secondary.user.id));
  if (copyPcProfile) {
    await tx
      .update(authUsers)
      .set({
        email: pc.user.email,
        emailVerified: pc.user.emailVerified,
        name: pc.user.name,
        image: pc.user.image,
        updatedAt: now,
      })
      .where(eq(authUsers.id, wechat.user.id));
  }
  return primary.user.id;
}

export async function respondToAccountLinkRequest(
  targetUserId: string,
  requestId: string,
  action: 'confirm' | 'reject',
): Promise<{ status: 'confirmed' | 'rejected'; primaryUserId?: string }> {
  return db.transaction(async (tx) => {
    const now = new Date();
    await expireRequests(tx, now);
    const [request] = await tx
      .select()
      .from(accountLinkRequests)
      .where(
        and(
          eq(accountLinkRequests.id, requestId),
          eq(accountLinkRequests.targetUserId, targetUserId),
          eq(accountLinkRequests.status, 'pending'),
        ),
      )
      .for('update')
      .limit(1);
    if (!request) {
      throw new AccountLinkError(
        '互绑申请不存在或已经失效',
        404,
        'ACCOUNT_LINK_REQUEST_NOT_FOUND',
      );
    }
    if (action === 'reject') {
      await tx
        .update(accountLinkRequests)
        .set({ status: 'rejected', respondedAt: now, updatedAt: now })
        .where(eq(accountLinkRequests.id, request.id));
      return { status: 'rejected' };
    }

    for (const id of [request.requesterUserId, request.targetUserId].sort()) {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`account-link:${id}`}))`,
      );
    }
    const requester = await readIdentity(tx, request.requesterUserId, true);
    const target = await readIdentity(tx, request.targetUserId, true);
    if (!requester || !target) {
      throw new AccountLinkError(
        '互绑账号已经不存在',
        404,
        'ACCOUNT_LINK_ACCOUNT_NOT_FOUND',
      );
    }
    const primaryUserId = await mergeIdentities(tx, requester, target);
    await tx
      .update(accountLinkRequests)
      .set({
        status: 'confirmed',
        primaryUserId,
        respondedAt: now,
        updatedAt: now,
      })
      .where(eq(accountLinkRequests.id, request.id));
    await tx
      .update(accountLinkRequests)
      .set({ status: 'cancelled', respondedAt: now, updatedAt: now })
      .where(
        and(
          eq(accountLinkRequests.status, 'pending'),
          ne(accountLinkRequests.id, request.id),
          or(
            eq(accountLinkRequests.requesterUserId, request.requesterUserId),
            eq(accountLinkRequests.targetUserId, request.requesterUserId),
            eq(accountLinkRequests.requesterUserId, request.targetUserId),
            eq(accountLinkRequests.targetUserId, request.targetUserId),
          ),
        ),
      );
    return { status: 'confirmed', primaryUserId };
  });
}
