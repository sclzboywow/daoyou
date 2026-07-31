import { executeLocalTransactionMessage } from '@server/lib/mq/LocalTransactionMessageExecutor';
import type { LocalTransactionMessageJobData } from '@server/lib/mq/localTransactionMessages';
import { createBullMqWorkerRedisConnection } from '@server/lib/redis';
import { settleSectConstructionMessage } from '@server/lib/services/sect-organization/SectConstructionSettlementService';
import { Worker, type Job } from 'bullmq';
import { MQ_KEYS } from '../mqKeys';
import {
  SECT_FACILITY_CONSTRUCTION_MESSAGE_KEY,
  SectFacilityConstructionMessagePayloadSchema,
} from './message';

const WORKER_CONCURRENCY = 4;

async function processConstructionJob(
  job: Job<LocalTransactionMessageJobData>,
): Promise<void> {
  if (!job.data.messageId) throw new Error('宗门建设队列消息缺少消息编号');
  await executeLocalTransactionMessage({
    messageId: job.data.messageId,
    messageKey: SECT_FACILITY_CONSTRUCTION_MESSAGE_KEY,
    source: 'sect_construction_queue',
    payloadSchema: SectFacilityConstructionMessagePayloadSchema,
    handle: settleSectConstructionMessage,
  });
}

export function createSectConstructionWorker(): Worker<LocalTransactionMessageJobData> {
  const worker = new Worker<LocalTransactionMessageJobData>(
    MQ_KEYS.queues.sectFacilityConstruction,
    processConstructionJob,
    {
      connection: createBullMqWorkerRedisConnection(),
      concurrency: WORKER_CONCURRENCY,
      prefix: MQ_KEYS.redisPrefix,
    },
  );
  worker.on('failed', (job, error) => {
    console.error('[sect-construction-worker] job failed', {
      messageId: job?.data.messageId,
      attemptsMade: job?.attemptsMade,
      error,
    });
  });
  worker.on('error', (error) => {
    console.error('[sect-construction-worker] worker error', error);
  });
  return worker;
}
