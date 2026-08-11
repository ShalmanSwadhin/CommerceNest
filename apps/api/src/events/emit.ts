import {
  createDomainEvent,
  type CommerceNestDomainEvent,
  type DomainEventName,
} from '@commercenest/types';
import { logger } from '../lib/logger.js';

type Handler = (event: CommerceNestDomainEvent) => void | Promise<void>;

const handlers = new Map<DomainEventName | '*', Set<Handler>>();

export function onEvent(
  eventName: DomainEventName | '*',
  handler: Handler,
): () => void {
  const set = handlers.get(eventName) ?? new Set();
  set.add(handler);
  handlers.set(eventName, set);
  return () => set.delete(handler);
}

export function emitEvent(
  eventName: DomainEventName,
  params: {
    storeId: string | null;
    actorId: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
  },
): CommerceNestDomainEvent {
  const event = createDomainEvent(eventName, params) as CommerceNestDomainEvent;
  const specific = handlers.get(eventName);
  const wildcard = handlers.get('*');

  const run = async () => {
    const all = [
      ...(specific ? Array.from(specific) : []),
      ...(wildcard ? Array.from(wildcard) : []),
    ];
    for (const handler of all) {
      try {
        await handler(event);
      } catch (err) {
        logger.error({ err, eventName }, 'Event subscriber failed');
      }
    }
  };

  queueMicrotask(() => {
    void run();
  });

  return event;
}

/** Emit after DB commit — alias kept for call-site clarity */
export function emitAfterCommit(
  eventName: DomainEventName,
  params: {
    storeId: string | null;
    actorId: string | null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;
  },
) {
  return emitEvent(eventName, params);
}
