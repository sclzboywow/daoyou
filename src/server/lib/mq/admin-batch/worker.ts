import { createBullMqWorkerRedisConnection } from '@server/lib/redis';
import {
  markAdminBatchJobForQueueRetry,
  processAdminBatchJob,
} from '@server/lib/services/AdminBatchJobService';
import { Worker, type Job } from 'bullmq';
import { MQ_KEYS } from '../mqKeys';
import type { AdminBatchJobData } from './types';

async function processJob(job: Job<AdminBatchJobData>): Promise<void> {
  if (!job.data.adminBatchJobId) {
    throw new Error('后台批处理缺少任务编号');
  }
  try {
    await processAdminBatchJob(job.data.adminBatchJobId);
  } catch (error) {
    await markAdminBatchJobForQueueRetry(job.data.adminBatchJobId, error);
    throw error;
  }
}

export function createAdminBatchWorker(): Worker<AdminBatchJobData> {
  const worker = new Worker<AdminBatchJobData>(
    MQ_KEYS.queues.adminBatch,
    processJob,
    {
      connection: createBullMqWorkerRedisConnection(),
      concurrency: 2,
      prefix: MQ_KEYS.redisPrefix,
    },
  );
  worker.on('failed', (job, error) => {
    console.error('[admin-batch-worker] job failed', {
      adminBatchJobId: job?.data.adminBatchJobId,
      attemptsMade: job?.attemptsMade,
      error,
    });
  });
  worker.on('error', (error) => {
    console.error('[admin-batch-worker] worker error', error);
  });
  return worker;
}
