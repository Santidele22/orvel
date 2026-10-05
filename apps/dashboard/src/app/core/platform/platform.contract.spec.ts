import { describe, expect, it } from 'vitest';
import { browserPlatform } from './platform.adapter';

/**
 * Fase 2 of #1098 — behaviour of the platform adapter.
 *
 * The app-wide rule that keeps `matchMedia` and `navigator.userAgent` out of
 * every file except `core/platform/**` lives in
 * `core/boundaries/core-boundary.contract.spec.ts`; this spec covers what the
 * adapter answers with and without a host.
 */

type ChangeListener = (event: { matches: boolean }) => void;

function installWindow(media: (query: string) => { matches: boolean } | null): {
  listeners: Map<string, Set<ChangeListener>>;
  removed: Array<{ query: string; listener: ChangeListener }>;
  restore: () => void;
} {
  const listeners = new Map<string, Set<ChangeListener>>();
  const removed: Array<{ query: string; listener: ChangeListener }> = [];
  const scope = globalThis as { window?: unknown };
  const previousWindow = scope.window;

  scope.window = {
    matchMedia:
      media === null
        ? undefined
        : (query: string) => {
            const result = media(query);
            return {
              matches: result.matches,
              addEventListener: (type: string, listener: ChangeListener) => {
                if (type !== 'change') return;
                const set = listeners.get(query) ?? new Set<ChangeListener>();
                set.add(listener);
                listeners.set(query, set);
              },
              removeEventListener: (type: string, listener: ChangeListener) => {
                if (type !== 'change') return;
                removed.push({ query, listener });
                listeners.get(query)?.delete(listener);
              }
            };
          }
  };

  return {
    listeners,
    removed,
    restore: () => {
      scope.window = previousWindow;
    }
  };
}

function withoutWindow(): () => void {
  const scope = globalThis as { window?: unknown };
  const previousWindow = scope.window;
  delete scope.window;

  return () => {
    scope.window = previousWindow;
  };
}

describe('core platform adapter', () => {
  it('answers media queries from the host and defaults to false without one', () => {
    const host = installWindow((query) => ({ matches: query === '(max-width: 1023px)' }));

    try {
      expect(browserPlatform().matchesMediaQuery('(max-width: 1023px)')).toBe(true);
      expect(browserPlatform().matchesMediaQuery('(min-width: 1024px)')).toBe(false);
    } finally {
      host.restore();
    }

    const restore = withoutWindow();
    try {
      expect(browserPlatform().matchesMediaQuery('(max-width: 1023px)')).toBe(false);
    } finally {
      restore();
    }
  });

  it('does not let a throwing host break the caller', () => {
    const scope = globalThis as { window?: unknown };
    const previousWindow = scope.window;
    scope.window = {
      matchMedia: () => {
        throw new Error('host exploded');
      }
    };

    try {
      expect(browserPlatform().matchesMediaQuery('(max-width: 1023px)')).toBe(false);
      expect(() => browserPlatform().onMediaQueryChange('(max-width: 1023px)', () => undefined)).not.toThrow();
    } finally {
      scope.window = previousWindow;
    }
  });

  it('subscribes, notifies and unsubscribes media query changes', () => {
    const host = installWindow((query) => ({ matches: query === '(max-width: 1023px)' }));
    const seen: boolean[] = [];

    try {
      const unsubscribe = browserPlatform().onMediaQueryChange('(max-width: 1023px)', (matches) => {
        seen.push(matches);
      });

      for (const listener of host.listeners.get('(max-width: 1023px)') ?? []) {
        listener({ matches: false });
      }

      expect(seen).toEqual([false]);
      expect(host.removed).toHaveLength(0);

      unsubscribe();
      expect(host.removed.map((entry) => entry.query)).toEqual(['(max-width: 1023px)']);
    } finally {
      host.restore();
    }
  });

  it('returns a no-op unsubscribe when there is no host to subscribe to', () => {
    const restore = withoutWindow();

    try {
      const unsubscribe = browserPlatform().onMediaQueryChange('(max-width: 1023px)', () => undefined);
      expect(() => unsubscribe()).not.toThrow();
    } finally {
      restore();
    }
  });

  it('reads the user agent and the iOS standalone flag from the host', () => {
    const scope = globalThis as { window?: unknown };
    const previousWindow = scope.window;
    const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');

    scope.window = { matchMedia: undefined };
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'Mozilla/5.0 (iPhone)', standalone: true }
    });

    try {
      expect(browserPlatform().rawUserAgent()).toBe('Mozilla/5.0 (iPhone)');
      expect(browserPlatform().isIosStandalone()).toBe(true);
    } finally {
      scope.window = previousWindow;
      if (navigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'navigator');
      }
    }

    // "No host" means no `navigator` either: Node ships one, so it is removed
    // explicitly instead of assuming the runtime has none.
    const restore = withoutWindow();
    Object.defineProperty(globalThis, 'navigator', { configurable: true, value: undefined });
    try {
      expect(browserPlatform().rawUserAgent()).toBe('');
      expect(browserPlatform().isIosStandalone()).toBe(false);
    } finally {
      restore();
      if (navigatorDescriptor) {
        Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'navigator');
      }
    }
  });
});
