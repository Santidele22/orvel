import {
  DestroyRef,
  PLATFORM_ID,
  Signal,
  inject,
  signal,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';

const DEFAULT_BREAKPOINT = '(max-width: 1023px)';

export function createIsMobileSignal(options?: { breakpoint?: string }): {
  isMobile: Signal<boolean>;
} {
  const breakpoint = options?.breakpoint ?? DEFAULT_BREAKPOINT;
  const platformId = inject(PLATFORM_ID);
  const destroyRef = inject(DestroyRef);
  const isMobile = signal(false);

  if (!isPlatformBrowser(platformId)) {
    // SSR: default to desktop, don't subscribe.
    return { isMobile: isMobile.asReadonly() };
  }

  const mql = window.matchMedia(breakpoint);
  isMobile.set(mql.matches);

  const handler = (event: MediaQueryListEvent): void => {
    isMobile.set(event.matches);
  };

  // Modern API preferred; legacy fallback for Safari < 14.
  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', handler);
    destroyRef.onDestroy(() => mql.removeEventListener('change', handler));
  } else if (typeof (mql as any).addListener === 'function') {
    (mql as any).addListener(handler);
    destroyRef.onDestroy(() => (mql as any).removeListener(handler));
  }

  return { isMobile: isMobile.asReadonly() };
}
