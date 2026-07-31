import type { DbTransaction } from '@server/lib/drizzle/db';
import {
  lockLocalTransactionMessage,
  markLocalTransactionMessageCompleted,
} from '@server/lib/repositories/localTransactionMessageRepository';
import {
  systemCommandExecutor,
  type FeatureCommandResult,
} from '@server/lib/services/CommandExecutors';
import type { z } from 'zod';
import type { LocalTransactionMessageKey } from './mqKeys';

type LocalTransactionMessageSkipResult = {
  status: 'already_completed' | 'missing';
};

export function executeLocalTransactionMessage<TPayload, TResult>(input: {
  messageId: string;
  messageKey: LocalTransactionMessageKey;
  source: string;
  payloadSchema: z.ZodType<TPayload>;
  handle(
    payload: TPayload,
    tx: DbTransaction,
  ): Promise<FeatureCommandResult<TResult>>;
}) {
  return systemCommandExecutor.execute<
    TResult | LocalTransactionMessageSkipResult
  >({
    source: input.source,
    requestId: input.messageId,
    allowEmpty: true,
    command: async (
      tx,
    ): Promise<
      FeatureCommandResult<TResult | LocalTransactionMessageSkipResult>
    > => {
      const message = await lockLocalTransactionMessage(input.messageId, tx);
      if (!message || message.completedAt) {
        return {
          result: { status: message ? 'already_completed' : 'missing' },
          resourceChanges: [],
        };
      }
      if (message.messageKey !== input.messageKey) {
        throw new Error(
          `本地事务消息类型不匹配: expected=${input.messageKey}, actual=${message.messageKey}`,
        );
      }

      const payload = input.payloadSchema.parse(message.payload);
      const handled = await input.handle(payload, tx);
      const completed = await markLocalTransactionMessageCompleted(
        message.id,
        tx,
      );
      if (!completed)
        throw new Error(`本地事务消息状态更新失败: ${message.id}`);
      return {
        result: handled.result,
        resourceChanges: handled.resourceChanges,
      };
    },
  });
}
