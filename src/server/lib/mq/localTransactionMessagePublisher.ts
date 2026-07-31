import { findLocalTransactionMessage } from '@server/lib/repositories/localTransactionMessageRepository';
import { requireLocalTransactionMessageRoute } from './messageRouteRegistry';
import { getMqQueue } from './queueRegistry';

export async function publishLocalTransactionMessage(
  messageId: string,
): Promise<void> {
  const message = await findLocalTransactionMessage(messageId);
  if (!message) throw new Error(`本地事务消息不存在: ${messageId}`);

  const route = requireLocalTransactionMessageRoute(message.messageKey);
  const job = await getMqQueue(route.queueKey).add(
    route.jobKey,
    { messageId },
    { jobId: messageId },
  );
  if ((await job.getState()) === 'failed') {
    await job.retry();
  }
}
