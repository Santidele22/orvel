import type { BrowserEnvironment } from './browser-environment.port';

/**
 * Fase 1 of #1098 — the browser implementation of the browser-environment port.
 *
 * This is the only file under `core/` allowed to touch `document` or `window`
 * events; `browser-environment.contract.spec.ts` walks the tree and fails on any
 * other. Every capability is checked before use, so the same code runs in a
 * browser, in Node and in an SSR pass: missing host means "no events, visible".
 *
 * Keep this file free of policy: it only translates the host, never decides
 * what the core should do.
 */

const noop = (): void => undefined;

function canSubscribeToWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function';
}

function canDispatchToWindow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.dispatchEvent === 'function' &&
    typeof CustomEvent !== 'undefined'
  );
}

export function browserEnvironment(): BrowserEnvironment {
  return {
    isVisible(): boolean {
      if (typeof document === 'undefined') {
        return true;
      }

      return document.visibilityState === 'visible';
    },

    onVisibilityChange(listener: () => void): () => void {
      if (typeof document === 'undefined' || typeof document.addEventListener !== 'function') {
        return noop;
      }

      document.addEventListener('visibilitychange', listener);
      return () => document.removeEventListener('visibilitychange', listener);
    },

    onWindowEvent(type: string, listener: () => void): () => void {
      if (!canSubscribeToWindow()) {
        return noop;
      }

      window.addEventListener(type, listener);
      return () => window.removeEventListener(type, listener);
    },

    dispatchWindowEvent(type: string, detail?: unknown): void {
      if (!canDispatchToWindow()) {
        return;
      }

      window.dispatchEvent(new CustomEvent(type, { detail }));
    },

    currentOrigin(): string {
      if (typeof window === 'undefined' || !window.location) {
        return '';
      }

      return window.location.origin;
    },

    navigateTo(url: string): void {
      if (typeof window === 'undefined' || typeof window.location?.assign !== 'function') {
        return;
      }

      window.location.assign(url);
    },

    async writeClipboardText(text: string): Promise<boolean> {
      const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard;
      if (!clipboard?.writeText) {
        return false;
      }

      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }
  };
}
