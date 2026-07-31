import type { DbExecutor, DbTransaction } from '@server/lib/drizzle/db';
import { getExecutor } from '@server/lib/drizzle/db';
import { localTransactionMessages } from '@server/lib/drizzle/schema';
import type { LocalTransactionMessageKey } from '@server/lib/mq/mqKeys';
import { and, asc, eq, isNull, lt } from 'drizzle-orm';

export async function createLocalTransactionMessage(
  input: {
    messageKey: LocalTransactionMessageKey;
    payload: unknown;
    deduplicationKey?: string;
  },
  tx: DbTransaction,
) {
  const [row] = await tx
    .insert(localTransactionMessages)
    .values({
      messageKey: input.messageKey,
      payload: input.payload,
      deduplicationKey: input.deduplicationKey,
    })
    .returning({ id: localTransactionMessages.id });
  if (!row) throw new Error('创建本地事务消息失败');
  return row;
}

export async function findLocalTransactionMessage(
  messageId: string,
  q: DbExecutor | DbTransaction = getExecutor(),
) {
  const [row] = await q
    .select()
    .from(localTransactionMessages)
    .where(eq(localTransactionMessages.id, messageId))
    .limit(1);
  return row ?? null;
}

export async function listPendingLocalTransactionMessageIds(
  limit: number,
  q: DbExecutor | DbTransaction = getExecutor(),
) {
  return q
    .select({ id: localTransactionMessages.id })
    .from(localTransactionMessages)
    .where(isNull(localTransactionMessages.completedAt))
    .orderBy(asc(localTransactionMessages.createdAt))
    .limit(limit);
}

export async function lockLocalTransactionMessage(
  messageId: string,
  tx: DbTransaction,
) {
  const [row] = await tx
    .select()
    .from(localTransactionMessages)
    .where(eq(localTransactionMessages.id, messageId))
    .for('update');
  return row ?? null;
}

export async function markLocalTransactionMessageCompleted(
  messageId: string,
  tx: DbTransaction,
) {
  const [row] = await tx
    .update(localTransactionMessages)
    .set({ completedAt: new Date() })
    .where(
      and(
        eq(localTransactionMessages.id, messageId),
        isNull(localTransactionMessages.completedAt),
      ),
    )
    .returning({ id: localTransactionMessages.id });
  return row ?? null;
}

export async function pruneCompletedLocalTransactionMessages(
  cutoff: Date,
  q: DbExecutor | DbTransaction = getExecutor(),
): Promise<number> {
  const rows = await q
    .delete(localTransactionMessages)
    .where(lt(localTransactionMessages.completedAt, cutoff))
    .returning({ id: localTransactionMessages.id });
  return rows.length;
}
