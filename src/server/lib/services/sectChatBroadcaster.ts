import {
  createPubSubEnvelope,
  parsePubSubEnvelope,
} from '@server/lib/services/pubSubEnvelope';
import {
  publishRedisMessage,
  subscribeRedisChannel,
} from '@server/lib/services/redisPubSub';
import type { WorldChatMessageDTO } from '@shared/types/world-chat';

type Listener = (message: WorldChatMessageDTO) => void;
type SectSubscription = {
  listeners: Set<Listener>;
  unsubscribeRedis: () => void;
};

const subscriptions = new Map<string, SectSubscription>();

function channelForSect(sectId: string) {
  return `sect-chat:${sectId}`;
}

function isSectChatMessage(value: unknown): value is WorldChatMessageDTO {
  return Boolean(
    value &&
      typeof value === 'object' &&
      (value as { channel?: unknown }).channel === 'sect' &&
      typeof (value as { id?: unknown }).id === 'string' &&
      typeof (value as { sectId?: unknown }).sectId === 'string',
  );
}

function notify(subscription: SectSubscription, message: WorldChatMessageDTO) {
  for (const listener of subscription.listeners) {
    listener(message);
  }
}

export function subscribeSectChatMessages(
  sectId: string,
  listener: Listener,
): () => void {
  let subscription = subscriptions.get(sectId);
  if (!subscription) {
    const listeners = new Set<Listener>();
    const created: SectSubscription = {
      listeners,
      unsubscribeRedis: subscribeRedisChannel(channelForSect(sectId), (raw) => {
        const message = parsePubSubEnvelope(raw, isSectChatMessage);
        if (message?.sectId === sectId) {
          notify(created, message);
        }
      }),
    };
    subscription = created;
    subscriptions.set(sectId, created);
  }

  subscription.listeners.add(listener);
  return () => {
    const current = subscriptions.get(sectId);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size > 0) return;
    current.unsubscribeRedis();
    subscriptions.delete(sectId);
  };
}

export function publishSectChatMessage(
  sectId: string,
  message: WorldChatMessageDTO,
): void {
  const subscription = subscriptions.get(sectId);
  if (subscription) {
    notify(subscription, message);
  }
  void publishRedisMessage(
    channelForSect(sectId),
    JSON.stringify(createPubSubEnvelope(message)),
  );
}
