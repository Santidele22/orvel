import { describe, expect, it } from 'vitest';
import { browserStorage } from './browser-storage.adapter';

/**
 * Fase 1 of #1098 — behaviour of the browser storage adapter.
 *
 * The core-wide rule that keeps Web Storage out of every other core file lives
 * in `core/boundaries/core-boundary.contract.spec.ts`; this spec covers what the
 * adapter does with and without a host.
 */

describe('browser storage adapter', () => {
  it('resolves to null when there is no window, so core code can run in Node', () => {
    const originalWindow = (globalThis as { window?: unknown }).window;
    delete (globalThis as { window?: unknown }).window;

    try {
      expect(browserStorage()).toBeNull();
    } finally {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  it('hands back the browser Web Storage when a window exists', () => {
    const storage = browserStorage();

    expect(storage).not.toBeNull();
    storage?.setItem('orvel.storage-port.probe', 'ok');
    expect(storage?.getItem('orvel.storage-port.probe')).toBe('ok');
    storage?.removeItem('orvel.storage-port.probe');
    expect(storage?.getItem('orvel.storage-port.probe')).toBeNull();
  });
});
