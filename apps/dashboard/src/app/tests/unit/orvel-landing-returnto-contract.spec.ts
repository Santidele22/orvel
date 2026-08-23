import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  buildLandingLoginRedirect,
  buildLandingPlanSelectionRedirect,
  sanitizeReturnTo
} from '../../core/auth/route-protection';
import { CANONICAL_PLAN_CODES, PLAN_CODE_ALIASES } from '../../core/plans/plan-entitlements';

const DASHBOARD_AUTH_GUARD_PATH = new URL('../../core/auth/dashboard-auth.guard.ts', import.meta.url);

async function loadDashboardAuthGuardSource(): Promise<string> {
  return readFile(DASHBOARD_AUTH_GUARD_PATH, 'utf8');
}

describe('Contract: Model C dashboard unauthenticated redirect', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const originalPublicLandingUrl = process.env.PUBLIC_LANDING_URL;

  function restoreRuntime(): void {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
    if (originalPublicLandingUrl === undefined) {
      delete process.env.PUBLIC_LANDING_URL;
    } else {
      process.env.PUBLIC_LANDING_URL = originalPublicLandingUrl;
    }
  }

  it('builds the landing auth redirect with the originally requested dashboard path encoded as returnTo', () => {
    const redirect = buildLandingLoginRedirect('/dashboard/agenda?date=2026-05-13&view=week');
    const parsed = new URL(redirect);

    expect(parsed.origin).toBe('https://orvel.pro');
    expect(parsed.pathname).toBe('/auth/login');
    expect(parsed.searchParams.get('returnTo')).toBe('/dashboard/agenda?date=2026-05-13&view=week');
  });

  it('uses local landing origin for dashboard localhost redirects without requiring deployment env', () => {
    delete process.env.PUBLIC_LANDING_URL;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost:4200', hostname: 'localhost' } }
    });

    try {
      const redirect = buildLandingLoginRedirect('/dashboard/inicio');
      const parsed = new URL(redirect);

      expect(parsed.origin).toBe('http://localhost:4321');
      expect(parsed.pathname).toBe('/auth/login');
      expect(parsed.searchParams.get('returnTo')).toBe('/dashboard/inicio');
    } finally {
      restoreRuntime();
    }
  });

  it('keeps QA dashboard redirects on qa.orvel.pro when PUBLIC_LANDING_URL is unset', () => {
    delete process.env.PUBLIC_LANDING_URL;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'https://qa.orvel.pro', hostname: 'qa.orvel.pro' } }
    });

    try {
      const login = new URL(buildLandingLoginRedirect('/dashboard/inicio'));
      const plan = new URL(buildLandingPlanSelectionRedirect('/dashboard/inicio'));

      expect(login.origin).toBe('https://qa.orvel.pro');
      expect(login.pathname).toBe('/auth/login');
      expect(plan.origin).toBe('https://qa.orvel.pro');
      expect(plan.pathname).toBe('/auth/signup/plan');
    } finally {
      restoreRuntime();
    }
  });

  it('honors PUBLIC_LANDING_URL before localhost defaults', () => {
    process.env.PUBLIC_LANDING_URL = 'http://127.0.0.1:4321/some/path?ignored=true';

    try {
      const redirect = buildLandingLoginRedirect('/dashboard');

      expect(redirect).toBe('http://127.0.0.1:4321/auth/login?returnTo=%2Fdashboard');
    } finally {
      restoreRuntime();
    }
  });

  it('sanitizes unsafe dashboard returnTo values before redirecting to landing auth', () => {
    for (const unsafeReturnTo of [
      'https://evil.example/dashboard',
      'http://evil.example/dashboard',
      '//evil.example/dashboard',
      'javascript:alert(1)',
      ' data:text/html,<script>alert(1)</script>'
    ]) {
      expect(sanitizeReturnTo(unsafeReturnTo)).toBe('/dashboard');
      expect(buildLandingLoginRedirect(unsafeReturnTo)).toBe(
        'https://orvel.pro/auth/login?returnTo=%2Fdashboard'
      );
    }
  });

  it('dashboard guard must not discard the current route in favor of a generic /dashboard returnTo', async () => {
    const source = await loadDashboardAuthGuardSource();

    expect(source).toContain('const safeReturnTo = sanitizeReturnTo(currentUrl ??');
    expect(source).toContain('buildLandingLoginRedirect(safeReturnTo)');
    expect(source).not.toContain('access.redirectTo ?? buildLandingLoginRedirect(safeReturnTo)');
  });

  it('dashboard guard hard-navigates to landing auth instead of returning an internal UrlTree that can blank the shell', async () => {
    const source = await loadDashboardAuthGuardSource();

    expect(source).toContain('window.location.assign(landingRedirect)');
    expect(source).toContain('return false');
    expect(source).not.toContain('router.parseUrl(buildLandingLoginRedirect');
  });
});

describe('Contract: Supabase plan codes are canonical in dashboard', () => {
  it('does not promote non-Supabase marketing aliases such as STARTED to canonical plan codes', () => {
    expect(CANONICAL_PLAN_CODES).not.toContain('STARTED');
    expect(Object.keys(PLAN_CODE_ALIASES)).not.toContain('STARTED');
  });
});
