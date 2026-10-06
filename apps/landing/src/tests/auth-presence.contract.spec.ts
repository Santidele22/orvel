import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  AUTH_PRESENCE_KEY,
  AUTH_PRESENCE_MAX_AGE_MS,
  isAuthPresent,
  markAuthPresent,
} from '../lib/auth-presence';

/**
 * The landing needs exactly one thing from the operator's session: whether this
 * browser signed in before, so a plan click can route into onboarding instead of
 * the credentials form. It must not need a credential to answer that.
 *
 * Audit finding S2 makes the difference material: anything durable under the
 * landing origin is readable by an XSS there. A boolean hint routes a URL; the
 * destination still enforces auth.
 */

describe('landing auth presence hint', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  it('is absent until a sign-in is marked', () => {
    expect(isAuthPresent()).toBe(false);
  });

  it('reports presence after a sign-in', () => {
    markAuthPresent();
    expect(isAuthPresent()).toBe(true);
  });

  it('stores no credential, only a timestamp', () => {
    markAuthPresent();
    const raw = localStorage.getItem(AUTH_PRESENCE_KEY);
    expect(raw).toBeTruthy();
    expect(raw).not.toMatch(/token|bearer|eyJ|refresh|access|password/i);
    expect(JSON.parse(raw as string)).toEqual({ at: expect.any(Number) });
  });

  it('stops reporting presence once the hint is older than its max age', () => {
    vi.useFakeTimers();
    markAuthPresent();
    expect(isAuthPresent()).toBe(true);

    vi.advanceTimersByTime(AUTH_PRESENCE_MAX_AGE_MS + 1);
    expect(isAuthPresent()).toBe(false);
  });

  it('fails closed on a corrupted hint instead of throwing', () => {
    localStorage.setItem(AUTH_PRESENCE_KEY, 'not-json');
    expect(isAuthPresent()).toBe(false);
  });

  it('fails closed when the timestamp is not a number', () => {
    localStorage.setItem(AUTH_PRESENCE_KEY, JSON.stringify({ at: 'ayer' }));
    expect(isAuthPresent()).toBe(false);
  });
});
