import { recoverAdminBatchJobs } from '@server/lib/services/AdminBatchJobService';

const RECOVERY_INTERVAL_MS = 30_000;
let timer: ReturnType<typeof setInterval> | undefined;
let running = false;

async function recover(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await recoverAdminBatchJobs();
  } finally {
    running = false;
  }
}

export function startAdminBatchRecovery(): void {
  if (timer) return;
  void recover().catch((error) => {
    console.error('[admin-batch-recovery] initial recovery failed', error);
  });
  timer = setInterval(() => {
    void recover().catch((error) => {
      console.error('[admin-batch-recovery] recovery failed', error);
    });
  }, RECOVERY_INTERVAL_MS);
  timer.unref();
}
