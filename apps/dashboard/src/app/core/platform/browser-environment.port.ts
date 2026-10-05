/**
 * Fase 1 of #1098 — the browser-environment port of the shared core.
 *
 * `core/*` may run where there is no DOM (Node, SSR, and later the native
 * target), so it never touches `document` and never subscribes to `window`
 * directly: it depends on this contract and receives the host through
 * `platform/browser-environment.adapter.ts` (or a fake, in tests).
 *
 * The port is deliberately not `null`-returning like the storage port: the
 * useful degradation here is a *silent, visible* environment, so callers stay
 * linear instead of branching around every event.
 */
export type BrowserEnvironment = {
  /**
   * `document.visibilityState === 'visible'`.
   *
   * `true` when there is no document: with no way to know, "visible" is the
   * answer that keeps the data path running (a background refresh is harmless).
   */
  isVisible(): boolean;

  /** Subscribes to `visibilitychange`; returns the unsubscribe function. */
  onVisibilityChange(listener: () => void): () => void;

  /** Subscribes to a window event; returns the unsubscribe function. */
  onWindowEvent(type: string, listener: () => void): () => void;

  /** Dispatches a `CustomEvent` on the window; no-op when there is no host. */
  dispatchWindowEvent(type: string, detail?: unknown): void;

  /**
   * Origin of the current document, used to build absolute return URLs.
   * `''` when there is no host, so callers can still build a path.
   */
  currentOrigin(): string;

  /** Navigates the host to `url`; no-op when there is no host. */
  navigateTo(url: string): void;

  /** Writes text to the host clipboard; `false` when there is none or it fails. */
  writeClipboardText(text: string): Promise<boolean>;
};
