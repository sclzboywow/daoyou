import type {
  ResourceChange,
  ResourceScope,
} from '@shared/contracts/resources';
import { ResourceChangeSchema } from '@shared/contracts/resources';
import {
  createPubSubEnvelope,
  parsePubSubEnvelope,
} from './pubSubEnvelope';
import { publishRedisMessage, subscribeRedisChannel } from './redisPubSub';

type Listener = (changes: ResourceChange[]) => void;

const RESOURCE_CHANNEL_PREFIX = 'resource-state:';
const listeners = new Map<string, Set<Listener>>();
const redisSubscriptions = new Map<string, () => void>();

function scopeKey(scope: ResourceScope): string {
  return `${scope.kind}:${scope.id}`;
}

function channelForScope(scope: ResourceScope): string {
  return `${RESOURCE_CHANNEL_PREFIX}${scopeKey(scope)}`;
}

function isResourceChanges(value: unknown): value is ResourceChange[] {
  return ResourceChangeSchema.array().safeParse(value).success;
}

function parseEvents(raw: string): ResourceChange[] {
  const changes = parsePubSubEnvelope(raw, isResourceChanges);
  return changes ? ResourceChangeSchema.array().parse(changes) : [];
}

function ensureRedisSubscription(scope: ResourceScope): void {
  const key = scopeKey(scope);
  if (redisSubscriptions.has(key)) return;
  const unsubscribe = subscribeRedisChannel(channelForScope(scope), (raw) => {
    const events = parseEvents(raw);
    if (events.length > 0) notifyLocalListeners(scope, events);
  });
  redisSubscriptions.set(key, unsubscribe);
}

function notifyLocalListeners(
  scope: ResourceScope,
  events: ResourceChange[],
): void {
  const set = listeners.get(scopeKey(scope));
  if (!set) return;
  for (const listener of set) listener(events);
}

export function subscribeResourceEvents(
  scopes: readonly ResourceScope[],
  listener: Listener,
): () => void {
  const unsubscribers = scopes.map((scope) => {
    const key = scopeKey(scope);
    const set = listeners.get(key) ?? new Set<Listener>();
    set.add(listener);
    listeners.set(key, set);
    ensureRedisSubscription(scope);
    return () => {
      set.delete(listener);
      if (set.size === 0) {
        listeners.delete(key);
        redisSubscriptions.get(key)?.();
        redisSubscriptions.delete(key);
      }
    };
  });
  return () => {
    for (const unsubscribe of unsubscribers) unsubscribe();
  };
}

export function publishResourceEvents(events: ResourceChange[]): void {
  const grouped = new Map<
    string,
    { scope: ResourceScope; events: ResourceChange[] }
  >();
  for (const event of events) {
    const key = scopeKey(event.scope);
    const group = grouped.get(key) ?? { scope: event.scope, events: [] };
    group.events.push(event);
    grouped.set(key, group);
  }
  for (const group of grouped.values()) {
    notifyLocalListeners(group.scope, group.events);
    void publishRedisMessage(
      channelForScope(group.scope),
      JSON.stringify(createPubSubEnvelope(group.events)),
    );
  }
}
