import { isRedisConfigured } from '@server/lib/redis';
import type { Worker } from 'bullmq';
import { MQ_KEYS } from './mqKeys';
import { startLocalTransactionOutboxRelay } from './outboxRelay';
import { createSectConstructionWorker } from './sect-construction/worker';
import { createTaskProgressWorker } from './task-progress/worker';
import { createAdminBatchWorker } from './admin-batch/worker';
import { startAdminBatchRecovery } from './admin-batch/recovery';

interface MqWorkerRegistration {
  queueKey: string;
  createWorker(): Worker;
}

interface MqAuxiliaryRegistration {
  name: string;
  start(): void;
}

/**
 * 所有 BullMQ Worker 必须在此登记，禁止业务模块在应用入口自行启动。
 * 后续新增 Worker 时，只需扩展此注册表即可统一完成启动、日志和防重复注册。
 */
const WORKER_REGISTRATIONS: readonly MqWorkerRegistration[] = [
  {
    queueKey: MQ_KEYS.queues.adminBatch,
    createWorker: createAdminBatchWorker,
  },
  {
    queueKey: MQ_KEYS.queues.sectFacilityConstruction,
    createWorker: createSectConstructionWorker,
  },
  {
    queueKey: MQ_KEYS.queues.taskProgress,
    createWorker: createTaskProgressWorker,
  },
];

/**
 * 与 MQ 可靠投递相关的后台组件统一登记在这里。
 * outbox relay 不是 Worker，但与所有事务消息队列使用同一生命周期启动。
 */
const AUXILIARY_REGISTRATIONS: readonly MqAuxiliaryRegistration[] = [
  {
    name: 'admin-batch-recovery',
    start: startAdminBatchRecovery,
  },
  {
    name: 'local-transaction-outbox-relay',
    start: startLocalTransactionOutboxRelay,
  },
];

let registeredWorkers: Worker[] = [];

export function registerMqWorkers(): readonly Worker[] {
  if (!isRedisConfigured() || registeredWorkers.length > 0)
    return registeredWorkers;

  registeredWorkers = WORKER_REGISTRATIONS.map((registration) => {
    const worker = registration.createWorker();
    console.info('[mq] worker registered', {
      queueKey: registration.queueKey,
    });
    return worker;
  });
  for (const registration of AUXILIARY_REGISTRATIONS) {
    registration.start();
    console.info('[mq] auxiliary registered', { name: registration.name });
  }
  return registeredWorkers;
}
