import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const LOGIN_PAGE = new URL('../pages/auth/login.astro', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const HANDOFF_MODULE = new URL('../lib/dashboard-auth-handoff.ts', import.meta.url);

type DashboardAuthHandoffModule = {
  buildDashboardAuthUrl: (input: {
    dashboardOrigin: string;
    mode: 'login' | 'signup';
    returnTo?: string | null;
  }) => string;
};

async function loadDashboardAuthHandoff(): Promise<DashboardAuthHandoffModule> {
  try {
    return (await import(HANDOFF_MODULE.href)) as DashboardAuthHandoffModule;
  } catch (error) {
    throw new Error(
      `Expected landing handoff helper at src/lib/dashboard-auth-handoff.ts. Original error: ${String(error)}`
    );
  }
}

describe('RED Contract: Model C landing-to-dashboard auth handoff', () => {
  it('builds dashboard /auth URLs with mode and sanitized returnTo', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const loginUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        returnTo: '/dashboard/turnos?view=week'
      })
    );

    expect(loginUrl.origin).toBe('https://orvel.pro');
    expect(loginUrl.pathname).toBe('/dashboard/auth');
    expect(loginUrl.searchParams.get('mode')).toBe('login');
    expect(loginUrl.searchParams.get('returnTo')).toBe('/dashboard/turnos?view=week');

    const signupUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard/',
        mode: 'signup',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(signupUrl.pathname).toBe('/dashboard/auth');
    expect(signupUrl.searchParams.get('mode')).toBe('signup');
    expect(signupUrl.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });

  it('falls back to dashboard home and never encodes access/refresh tokens into handoff redirects', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    for (const returnTo of [
      'https://evil.example/dashboard',
      '//evil.example/dashboard',
      'javascript:alert(1)',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio#refresh_token=secret'
    ]) {
      const handoff = buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        returnTo
      });
      const parsed = new URL(handoff);

      expect(parsed.searchParams.get('returnTo')).toBe('/');
      expect(handoff).not.toMatch(/access_token|refresh_token/i);
    }
  });

  it('login page delegates credentials auth to dashboard instead of finalizing Supabase session on landing', async () => {
    const source = await readFile(LOGIN_PAGE, 'utf8');

    expect(source).toContain('buildDashboardAuthUrl');
    expect(source).toContain("mode: 'login'");
    expect(source).not.toContain('loginWithProvider');
    expect(source).not.toContain('createSupabaseLoginAdapterFromEnv');
    expect(source).not.toMatch(/auth\.getSession\(|auth\.exchangeCodeForSession\(|access_token|refresh_token/i);
  });

  it('signup completion delegates session finalization to dashboard auth with mode=signup', async () => {
    const source = await readFile(SIGNUP_COMPLETE_PAGE, 'utf8');

    expect(source).toContain('buildDashboardAuthUrl');
    expect(source).toContain("mode: 'signup'");
    expect(source).not.toContain('signupWithProvider');
    expect(source).not.toMatch(/auth\.getSession\(|auth\.exchangeCodeForSession\(|access_token|refresh_token/i);
  });
});
