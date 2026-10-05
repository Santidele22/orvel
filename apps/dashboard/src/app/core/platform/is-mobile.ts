import { DestroyRef, Signal, inject, signal } from '@angular/core';
import { browserPlatform } from './platform.adapter';

/**
 * Fase 2 of #1098 — the app's mobile-viewport signal, on top of the platform port.
 *
 * This used to be one of three parallel ways of asking the host how wide it is.
 * The host access now lives in `platform.adapter.ts`; what stays here is the
 * Angular-facing part (a signal that follows the media query and is released
 * with the injection context).
 *
 * Without a host the answer is `false` (desktop), which is what SSR and the
 * tests want, and no subscription is made.
 */
const DEFAULT_BREAKPOINT = '(max-width: 1023px)';

export function createIsMobileSignal(options?: { breakpoint?: string }): {
  isMobile: Signal<boolean>;
} {
  const breakpoint = options?.breakpoint ?? DEFAULT_BREAKPOINT;
  const platform = browserPlatform();
  const destroyRef = inject(DestroyRef);
  const isMobile = signal(platform.matchesMediaQuery(breakpoint));

  const unsubscribe = platform.onMediaQueryChange(breakpoint, (matches) => {
    isMobile.set(matches);
  });

  destroyRef.onDestroy(unsubscribe);

  return { isMobile: isMobile.asReadonly() };
}
