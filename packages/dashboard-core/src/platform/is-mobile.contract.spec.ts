// @vitest-environment jsdom

import '@angular/compiler';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createIsMobileSignal } from './is-mobile';

/**
 * Fase 2 of #1098 — behaviour of the mobile-viewport signal.
 *
 * The old spec asserted the *source text* (that the file imported PLATFORM_ID
 * and named `window.matchMedia`), which stopped being the contract the moment
 * the host access moved to the platform port. This one drives a stubbed host.
 */
const DEFAULT_BREAKPOINT = '(max-width: 1023px)';

type ChangeListener = (event: { matches: boolean }) => void;

function stubMatchMedia(matchesFor: (query: string) => boolean): {
  queries: string[];
  removed: string[];
  emit: (query: string, matches: boolean) => void;
} {
  const listeners = new Map<string, Set<ChangeListener>>();
  const queries: string[] = [];
  const removed: string[] = [];

  // This jsdom build has no `matchMedia`, so the property is installed rather
  // than spied on; `afterEach` removes it again.
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => {
      queries.push(query);
      return {
        media: query,
        matches: matchesFor(query),
        onchange: null,
        addEventListener: (type: string, listener: ChangeListener) => {
          if (type !== 'change') return;
          const set = listeners.get(query) ?? new Set<ChangeListener>();
          set.add(listener);
          listeners.set(query, set);
        },
        removeEventListener: (type: string, listener: ChangeListener) => {
          if (type !== 'change') return;
          removed.push(query);
          listeners.get(query)?.delete(listener);
        },
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true
      } as unknown as MediaQueryList;
    }
  });

  return {
    queries,
    removed,
    emit: (query: string, matches: boolean) => {
      for (const listener of listeners.get(query) ?? []) {
        listener({ matches });
      }
    }
  };
}

function removeMatchMedia(): void {
  Reflect.deleteProperty(window, 'matchMedia');
}

describe('createIsMobileSignal contract', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
    removeMatchMedia();
  });

  it('answers from the host at creation and follows its changes', () => {
    const host = stubMatchMedia((query) => query === DEFAULT_BREAKPOINT);

    const { isMobile } = TestBed.runInInjectionContext(() => createIsMobileSignal());

    expect(isMobile()).toBe(true);

    host.emit(DEFAULT_BREAKPOINT, false);
    expect(isMobile()).toBe(false);

    host.emit(DEFAULT_BREAKPOINT, true);
    expect(isMobile()).toBe(true);
  });

  it('asks the host for the 1023px breakpoint unless told otherwise', () => {
    const host = stubMatchMedia(() => false);

    TestBed.runInInjectionContext(() => createIsMobileSignal());

    // One query for the initial value, one for the subscription: both are the
    // same breakpoint, and nothing else is ever asked about.
    expect([...new Set(host.queries)]).toEqual([DEFAULT_BREAKPOINT]);
  });

  it('accepts a custom breakpoint', () => {
    const host = stubMatchMedia((query) => query === '(max-width: 767px)');

    const { isMobile } = TestBed.runInInjectionContext(() =>
      createIsMobileSignal({ breakpoint: '(max-width: 767px)' })
    );

    expect([...new Set(host.queries)]).toEqual(['(max-width: 767px)']);
    expect(isMobile()).toBe(true);
  });

  it('stays on desktop when the host cannot answer', () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: () => {
        throw new Error('unsupported');
      }
    });

    const { isMobile } = TestBed.runInInjectionContext(() => createIsMobileSignal());

    expect(isMobile()).toBe(false);
  });

  it('releases the host listener with the injection context', () => {
    const host = stubMatchMedia(() => false);

    TestBed.runInInjectionContext(() => createIsMobileSignal());
    expect(host.removed).toEqual([]);

    TestBed.resetTestingModule();

    expect(host.removed).toEqual([DEFAULT_BREAKPOINT]);
  });
});
