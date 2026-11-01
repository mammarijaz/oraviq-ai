import type { ServerToClientEvents } from '@oraviq/shared';

type EventName = keyof ServerToClientEvents;
type Payload<E extends EventName> = Parameters<ServerToClientEvents[E]>[0];
type Handler<E extends EventName> = (p: Payload<E>) => void;

const handlers = new Map<EventName, Set<Handler<EventName>>>();

/** In-app relay of realtime events, for views that keep their own lists (call log, reviews). */
export const realtimeBus = {
  on<E extends EventName>(event: E, fn: Handler<E>): () => void {
    let set = handlers.get(event);
    if (!set) handlers.set(event, (set = new Set()));
    set.add(fn as Handler<EventName>);
    return () => set!.delete(fn as Handler<EventName>);
  },
  emit<E extends EventName>(event: E, payload: Payload<E>) {
    for (const fn of handlers.get(event) ?? []) fn(payload as Payload<EventName>);
  },
};
