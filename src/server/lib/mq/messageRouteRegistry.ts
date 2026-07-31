import {
  MQ_KEYS,
  type LocalTransactionMessageKey,
  type MqJobKey,
  type MqQueueKey,
} from './mqKeys';

export interface LocalTransactionMessageRoute {
  messageKey: LocalTransactionMessageKey;
  queueKey: MqQueueKey;
  jobKey: MqJobKey;
}

const MESSAGE_ROUTES: readonly LocalTransactionMessageRoute[] = [
  {
    messageKey: MQ_KEYS.messages.sectFacilityConstruction,
    queueKey: MQ_KEYS.queues.sectFacilityConstruction,
    jobKey: MQ_KEYS.jobs.applySectFacilityConstruction,
  },
];

export function requireLocalTransactionMessageRoute(
  messageKey: string,
): LocalTransactionMessageRoute {
  const route = MESSAGE_ROUTES.find(
    (candidate) => candidate.messageKey === messageKey,
  );
  if (!route) throw new Error(`本地事务消息未注册 MQ 路由: ${messageKey}`);
  return route;
}
