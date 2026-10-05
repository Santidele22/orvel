/**
 * Fase 2 of #1098 — the platform port of the shared core.
 *
 * The app used to answer "what kind of host am I on?" in three parallel ways:
 * `core/shell/is-mobile`, the operator tour's own `matchMedia` helper and
 * `features/pwa-install/pwa-display.ts`. This is the single seam instead: a
 * primitive contract over the host APIs, with the *policy* (which breakpoints,
 * which user agents) left to the callers.
 *
 * It is deliberately primitive and not a `isMobile()`/`isIos()` API: the app
 * already owns the breakpoint constants and the user-agent parsing, and moving
 * those decisions here would just relocate them. What moves is the host access.
 */
export interface Platform {
  /**
   * `matchMedia(query).matches`.
   *
   * `false` when there is no host, when the query throws, or when the host has
   * no `matchMedia`: callers degrade to their desktop/default branch.
   */
  matchesMediaQuery(query: string): boolean;

  /** Subscribes to a query's changes; returns the unsubscribe function. */
  onMediaQueryChange(query: string, listener: (matches: boolean) => void): () => void;

  /** Raw user agent of the host; `''` when there is no host. */
  rawUserAgent(): string;

  /** The iOS `navigator.standalone` flag; `false` everywhere else. */
  isIosStandalone(): boolean;
}
