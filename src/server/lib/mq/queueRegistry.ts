import { createBullMqProducerRedisConnection } from '@server/lib/redis';
import { Queue, type JobsOptions } from 'bullmq';
import type { LocalTransactionMessageJobData } from './localTransactionMessages';
import { MQ_KEYS, type MqQueueKey } from './mqKeys';

interface MqQueueConfig {
  defaultJobOptions: JobsOptions;
}

const QUEUE_CONFIGS: Readonly<Record<MqQueueKey, MqQueueConfig>> = {
  [MQ_KEYS.queues.sectFacilityConstruction]: {
    defaultJobOptions: {
      attempts: 10,
      backoff: { type: 'exponential', delay: 1_000 },
      removeOnComplete: { age: 24 * 60 * 60, count: 10_000 },
      removeOnFail: { age: 7 * 24 * 60 * 60, count: 10_000 },
    },
  },
};

const queues = new Map<MqQueueKey, Queue<LocalTransactionMessageJobData>>();

export function getMqQueue(
  queueKey: MqQueueKey,
): Queue<LocalTransactionMessageJobData> {
  const existing = queues.get(queueKey);
  if (existing) return existing;

  const config = QUEUE_CONFIGS[queueKey];
  if (!config) throw new Error(`MQ 队列未注册配置: ${queueKey}`);
  const queue = new Queue<LocalTransactionMessageJobData>(queueKey, {
    connection: createBullMqProducerRedisConnection(),
    prefix: MQ_KEYS.redisPrefix,
    defaultJobOptions: config.defaultJobOptions,
  });
  queues.set(queueKey, queue);
  return queue;
}
