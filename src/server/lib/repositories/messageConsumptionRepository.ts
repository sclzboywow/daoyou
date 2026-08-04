import type { DbExecutor, DbTransaction } from '@server/lib/drizzle/db';
import { getExecutor } from '@server/lib/drizzle/db';
import { messageConsumptions } from '@server/lib/drizzle/schema';
import { lt } from 'drizzle-orm';

export async function claimMessageForConsumer(
  input: {
    consumerName: string;
    messageId: string;
    messageKey: string;
  },
  tx: DbTransaction,
): Promise<boolean> {
  const [row] = await tx
    .insert(messageConsumptions)
    .values(input)
    .onConflictDoNothing()
    .returning({ messageId: messageConsumptions.messageId });
  return Boolean(row);
}

export async function pruneMessageConsumptions(
  cutoff: Date,
  q: DbExecutor | DbTransaction = getExecutor(),
): Promise<number> {
  const rows = await q
    .delete(messageConsumptions)
    .where(lt(messageConsumptions.processedAt, cutoff))
    .returning({ messageId: messageConsumptions.messageId });
  return rows.length;
}
