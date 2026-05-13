import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildLandingLoginRedirect, sanitizeReturnTo } from '../../core/auth/route-protection';
import { CANONICAL_PLAN_CODES, PLAN_CODE_ALIASES } from '../../core/plans/plan-entitlements';

const DASHBOARD_AUTH_GUARD_PATH = new URL('../../core/auth/dashboard-auth.guard.ts', import.meta.url);

async function loadDashboardAuthGuardSource(): Promise<string> {
  return readFile(DASHBOARD_AUTH_GUARD_PATH, 'utf8');
}

describe('Contract: Model C dashboard unauthenticated redirect', () => {
  it('builds the landing auth redirect with the originally requested dashboard path encoded as returnTo', () => {
    const redirect = buildLandingLoginRedirect('/dashboard/agenda?date=2026-05-13&view=week');
    const parsed = new URL(redirect);

    expect(parsed.origin).toBe('https://orvel-landing.vercel.app');
    expect(['/auth', '/auth/login']).toContain(parsed.pathname);
    expect(parsed.searchParams.get('returnTo')).toBe('/dashboard/agenda?date=2026-05-13&view=week');
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
        'https://orvel-landing.vercel.app/auth/login?returnTo=%2Fdashboard'
      );
    }
  });

  it('dashboard guard must not discard the current route in favor of a generic /dashboard returnTo', async () => {
    const source = await loadDashboardAuthGuardSource();

    expect(source).toContain('const safeReturnTo = sanitizeReturnTo(currentUrl ??');
    expect(source).toContain('buildLandingLoginRedirect(safeReturnTo)');
    expect(source).not.toContain('access.redirectTo ?? buildLandingLoginRedirect(safeReturnTo)');
  });
});

describe('Contract: Supabase plan codes are canonical in dashboard', () => {
  it('does not promote non-Supabase marketing aliases such as STARTED to canonical plan codes', () => {
    expect(CANONICAL_PLAN_CODES).not.toContain('STARTED');
    expect(Object.keys(PLAN_CODE_ALIASES)).not.toContain('STARTED');
  });
});
