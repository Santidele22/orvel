/**
 * Fase 1 of #1098 — ports of the notifications core.
 *
 * The realtime channel is a host capability: `core/*` keeps the handle so it can
 * release the subscription, and the SDK type stays behind the adapter. Only the
 * `unsubscribe` the core actually calls is part of the contract.
 */
export type RealtimeSubscription = {
  unsubscribe: () => void | PromiseLike<unknown>;
};
