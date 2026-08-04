import { createBullMqProducerRedisConnection } from '@server/lib/redis';
import { Queue, type JobsOptions } from 'bullmq';
import type { AdminBatchJobData } from './admin-batch/types';
import { MQ_KEYS, type MqQueueKey } from './mqKeys';

interface MqQueueConfig {
  defaultJobOptions: JobsOptions;
}

const QUEUE_CONFIGS: Readonly<Record<MqQueueKey, MqQueueConfig>> = {
  [MQ_KEYS.queues.adminBatch]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 5_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 5_000 },
    },
  },
};

type RegisteredMqJobData = AdminBatchJobData;

const queues = new Map<MqQueueKey, Queue<RegisteredMqJobData>>();

export function getMqQueue<TJobData extends RegisteredMqJobData>(
  queueKey: MqQueueKey,
): Queue<TJobData> {
  const existing = queues.get(queueKey);
  if (existing) return existing as Queue<TJobData>;

  const config = QUEUE_CONFIGS[queueKey];
  if (!config) throw new Error(`MQ 队列未注册配置: ${queueKey}`);
  const queue = new Queue<RegisteredMqJobData>(queueKey, {
    connection: createBullMqProducerRedisConnection(),
    prefix: MQ_KEYS.redisPrefix,
    defaultJobOptions: config.defaultJobOptions,
  });
  queues.set(queueKey, queue);
  return queue as Queue<TJobData>;
}
