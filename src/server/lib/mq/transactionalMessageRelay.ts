import { listPendingTransactionalMessages } from '@server/lib/repositories/transactionalMessageRepository';
import { publishTransactionalMessage } from './transactionalMessagePublisher';

const RECOVERY_INTERVAL_MS = 5_000;
const RECOVERY_BATCH_SIZE = 100;

let recoveryTimer: ReturnType<typeof setInterval> | undefined;
let recoveryRunning = false;

async function recoverPendingMessages(): Promise<void> {
  if (recoveryRunning) return;
  recoveryRunning = true;
  try {
    const messages = await listPendingTransactionalMessages(
      RECOVERY_BATCH_SIZE,
    );
    for (const message of messages) {
      try {
        await publishTransactionalMessage(message.id);
      } catch (error) {
        console.error('[transactional-message] publish failed', {
          messageId: message.id,
          messageKey: message.messageKey,
          error,
        });
      }
    }
  } finally {
    recoveryRunning = false;
  }
}

export function startTransactionalMessageRelay(): void {
  if (recoveryTimer) return;

  void recoverPendingMessages().catch((error) => {
    console.error('[transactional-message] initial recovery failed', error);
  });
  recoveryTimer = setInterval(() => {
    void recoverPendingMessages().catch((error) => {
      console.error('[transactional-message] recovery failed', error);
    });
  }, RECOVERY_INTERVAL_MS);
  recoveryTimer.unref();
}

export function stopTransactionalMessageRelay(): void {
  if (!recoveryTimer) return;
  clearInterval(recoveryTimer);
  recoveryTimer = undefined;
}
