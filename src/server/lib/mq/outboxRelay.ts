import { listPendingLocalTransactionMessageIds } from '@server/lib/repositories/localTransactionMessageRepository';
import { publishLocalTransactionMessage } from './localTransactionMessagePublisher';

const RECOVERY_INTERVAL_MS = 15_000;
const RECOVERY_BATCH_SIZE = 200;

let recoveryTimer: ReturnType<typeof setInterval> | undefined;
let recoveryRunning = false;

async function recoverPendingMessages(): Promise<void> {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    const messages =
      await listPendingLocalTransactionMessageIds(RECOVERY_BATCH_SIZE);
    for (const message of messages) {
      try {
        await publishLocalTransactionMessage(message.id);
      } catch (error) {
        console.error('[local-transaction-outbox] publish failed', {
          messageId: message.id,
          error,
        });
      }
    }
  } finally {
    recoveryRunning = false;
  }
}

export function startLocalTransactionOutboxRelay(): void {
  if (recoveryTimer) return;

  void recoverPendingMessages().catch((error) => {
    console.error('[local-transaction-outbox] initial recovery failed', error);
  });
  recoveryTimer = setInterval(() => {
    void recoverPendingMessages().catch((error) => {
      console.error('[local-transaction-outbox] recovery failed', error);
    });
  }, RECOVERY_INTERVAL_MS);
  recoveryTimer.unref();
}
