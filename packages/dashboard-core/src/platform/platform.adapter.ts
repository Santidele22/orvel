import type { Platform } from './platform.port';

/**
 * Fase 2 of #1098 — the browser implementation of the platform port.
 *
 * This is the only file in the app allowed to call `matchMedia` or read
 * `navigator.userAgent`; `core/boundaries/core-boundary.contract.spec.ts` walks
 * the tree and fails on any other. Every answer is checked before use, so the
 * same code runs in a browser, in Node and in an SSR pass.
 *
 * A throwing host must never break the caller: the operator tour bootstraps the
 * shell, and a media query is never worth an exception there.
 */

const noop = (): void => undefined;

function mediaQueryList(query: string): MediaQueryList | null {
  try {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return null;
    }

    return window.matchMedia(query);
  } catch {
    return null;
  }
}

export function browserPlatform(): Platform {
  return {
    matchesMediaQuery(query: string): boolean {
      try {
        return mediaQueryList(query)?.matches ?? false;
      } catch {
        return false;
      }
    },

    onMediaQueryChange(query: string, listener: (matches: boolean) => void): () => void {
      const mediaQuery = mediaQueryList(query);
      if (!mediaQuery) {
        return noop;
      }

      const handler = (event: MediaQueryListEvent): void => {
        listener(event.matches);
      };

      // Modern API preferred; legacy fallback for Safari < 14.
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
      }

      const legacy = mediaQuery as unknown as {
        addListener?: (handler: (event: MediaQueryListEvent) => void) => void;
        removeListener?: (handler: (event: MediaQueryListEvent) => void) => void;
      };

      if (typeof legacy.addListener === 'function') {
        legacy.addListener(handler);
        return () => legacy.removeListener?.(handler);
      }

      return noop;
    },

    rawUserAgent(): string {
      if (typeof navigator === 'undefined' || typeof navigator.userAgent !== 'string') {
        return '';
      }

      return navigator.userAgent;
    },

    isIosStandalone(): boolean {
      if (typeof navigator === 'undefined') {
        return false;
      }

      return Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
    }
  };
}
