import { describe, expect, it, vi } from 'vitest';
import { browserEnvironment } from './browser-environment.adapter';

/**
 * Fase 1 of #1098 — behaviour of the browser environment adapter.
 *
 * The core-wide rule that keeps `window`/`document`/`navigator` out of every
 * other core file lives in `core/boundaries/core-boundary.contract.spec.ts`;
 * this spec covers what the adapter does with and without a host.
 */

type Listener = () => void;

function installGlobals(globals: { window?: unknown; document?: unknown }): () => void {
  const scope = globalThis as { window?: unknown; document?: unknown };
  const previousWindow = scope.window;
  const previousDocument = scope.document;

  if ('window' in globals) {
    scope.window = globals.window;
  }
  if ('document' in globals) {
    scope.document = globals.document;
  }

  return () => {
    scope.window = previousWindow;
    scope.document = previousDocument;
  };
}

function withoutHost(): () => void {
  const scope = globalThis as { window?: unknown; document?: unknown };
  delete scope.window;
  delete scope.document;

  return installGlobals({ window: undefined, document: undefined });
}

describe('core browser-environment adapter', () => {
  it('degrades to a visible, silent environment when there is no host', async () => {
    const restore = withoutHost();

    try {
      const environment = browserEnvironment();

      expect(environment.isVisible()).toBe(true);
      expect(environment.currentOrigin()).toBe('');
      await expect(environment.writeClipboardText('orvel.pagos')).resolves.toBe(false);
      expect(() => {
        environment.navigateTo('/dashboard/login');
      }).not.toThrow();
      expect(() => {
        environment.dispatchWindowEvent('booking.created', { id: '1' });
      }).not.toThrow();

      const unsubscribe = environment.onWindowEvent('booking.created', () => undefined);
      const unsubscribeVisibility = environment.onVisibilityChange(() => undefined);
      expect(() => {
        unsubscribe();
        unsubscribeVisibility();
      }).not.toThrow();
    } finally {
      restore();
    }
  });

  it('subscribes and unsubscribes window events through the host window', () => {
    const registered: Array<{ type: string; listener: Listener }> = [];
    const removed: Array<{ type: string; listener: Listener }> = [];
    const restore = installGlobals({
      window: {
        addEventListener: (type: string, listener: Listener) => {
          registered.push({ type, listener });
        },
        removeEventListener: (type: string, listener: Listener) => {
          removed.push({ type, listener });
        },
        dispatchEvent: () => true
      }
    });

    try {
      const listener: Listener = () => undefined;
      const unsubscribe = browserEnvironment().onWindowEvent('booking.created', listener);

      expect(registered).toEqual([{ type: 'booking.created', listener }]);
      unsubscribe();
      expect(removed).toEqual([{ type: 'booking.created', listener }]);
    } finally {
      restore();
    }
  });

  it('dispatches window events as a CustomEvent carrying the detail', () => {
    const dispatched: Event[] = [];
    const restore = installGlobals({
      window: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: (event: Event) => {
          dispatched.push(event);
          return true;
        }
      }
    });

    try {
      browserEnvironment().dispatchWindowEvent('operator.agenda.sync', { branchId: 'b1' });

      expect(dispatched).toHaveLength(1);
      expect(dispatched[0].type).toBe('operator.agenda.sync');
      expect((dispatched[0] as CustomEvent).detail).toEqual({ branchId: 'b1' });
    } finally {
      restore();
    }
  });

  it('reads visibility from the host document and subscribes to visibilitychange', () => {
    const registered: Array<{ type: string; listener: Listener }> = [];
    const removed: Array<{ type: string; listener: Listener }> = [];
    const documentHost = {
      visibilityState: 'hidden' as DocumentVisibilityState,
      addEventListener: (type: string, listener: Listener) => {
        registered.push({ type, listener });
      },
      removeEventListener: (type: string, listener: Listener) => {
        removed.push({ type, listener });
      }
    };
    const restore = installGlobals({ document: documentHost });

    try {
      const environment = browserEnvironment();
      expect(environment.isVisible()).toBe(false);

      documentHost.visibilityState = 'visible';
      expect(environment.isVisible()).toBe(true);

      const listener: Listener = () => undefined;
      const unsubscribe = environment.onVisibilityChange(listener);
      expect(registered).toEqual([{ type: 'visibilitychange', listener }]);

      unsubscribe();
      expect(removed).toEqual([{ type: 'visibilitychange', listener }]);
    } finally {
      restore();
    }
  });

  it('reads the origin from the host and navigates through it', () => {
    const assigned: string[] = [];
    const restore = installGlobals({
      window: {
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => true,
        location: {
          origin: 'https://dashboard.orvel.pro',
          assign: (url: string) => {
            assigned.push(url);
          }
        }
      }
    });

    try {
      const environment = browserEnvironment();

      expect(environment.currentOrigin()).toBe('https://dashboard.orvel.pro');
      environment.navigateTo('/dashboard/login?handoff=1');
      expect(assigned).toEqual(['/dashboard/login?handoff=1']);
    } finally {
      restore();
    }
  });

  it('writes through the host clipboard and reports failure instead of throwing', async () => {
    const written: string[] = [];

    try {
      // Node exposes `navigator` as a getter-only global, so stub it.
      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: (text: string) => {
            written.push(text);
            return Promise.resolve();
          }
        }
      });
      await expect(browserEnvironment().writeClipboardText('orvel.pagos')).resolves.toBe(true);
      expect(written).toEqual(['orvel.pagos']);

      vi.stubGlobal('navigator', {
        clipboard: {
          writeText: () => Promise.reject(new Error('denied'))
        }
      });
      await expect(browserEnvironment().writeClipboardText('orvel.pagos')).resolves.toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
