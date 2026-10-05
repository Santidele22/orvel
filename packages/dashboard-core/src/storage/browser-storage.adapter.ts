import type { KeyValueStorage } from './storage.port';

/**
 * Fase 1 of #1098 — the browser implementation of the storage port.
 *
 * This is the only file under `core/` allowed to read `window.localStorage`;
 * `browser-storage.contract.spec.ts` walks the tree and fails on any other.
 * Keep it that way: swap the implementation here (or provide another one at the
 * composition root) instead of reaching for `window` from core code.
 *
 * Returns `null` when there is no `window`, which is what makes the rest of the
 * core runnable in Node.
 */
export function browserStorage(): KeyValueStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage ?? null;
}
