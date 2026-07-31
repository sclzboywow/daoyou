import type { DbTransaction } from '@server/lib/drizzle/db';
import { createLocalTransactionMessage } from '@server/lib/repositories/localTransactionMessageRepository';
import type { LocalTransactionMessageKey } from './mqKeys';

export interface LocalTransactionMessageJobData {
  messageId: string;
}

export interface LocalTransactionMessageWriter {
  create(input: {
    messageKey: LocalTransactionMessageKey;
    payload: unknown;
    deduplicationKey?: string;
  }): Promise<{ id: string }>;
}

export function createPostgresLocalTransactionMessageWriter(
  tx: DbTransaction,
): LocalTransactionMessageWriter {
  return {
    create: (input) => createLocalTransactionMessage(input, tx),
  };
}
