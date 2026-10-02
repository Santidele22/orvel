/**
 * Fase 1 of #1098 — the storage port of the shared core.
 *
 * `core/*` may run where there is no DOM (Node, SSR, and later the native
 * target), so it never names Web Storage directly: it depends on this
 * structural contract and receives an implementation from the outside.
 *
 * The shape is deliberately the Web Storage subset the core actually uses, so
 * `window.localStorage`, the in-memory fake in tests and a future
 * `@capacitor/preferences` adapter are all valid implementations.
 *
 * `null` is part of the contract: callers must say what happens when there is
 * nowhere to persist, instead of assuming a browser.
 */
export type KeyValueStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
};
