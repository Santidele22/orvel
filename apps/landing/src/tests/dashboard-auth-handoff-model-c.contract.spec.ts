import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const LOGIN_PAGE = new URL('../pages/auth/login.astro', import.meta.url);
const AUTH_COMPAT_PAGE = new URL('../pages/auth.astro', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SIGNUP_ONBOARDING_PAGE = new URL('../pages/auth/signup/onboarding.astro', import.meta.url);
const HANDOFF_MODULE = new URL('../lib/dashboard-auth-handoff.ts', import.meta.url);

type DashboardAuthHandoffModule = {
  buildDashboardAuthUrl: (input: {
    dashboardOrigin: string;
    mode: 'login' | 'signup';
    returnTo?: string | null;
  }) => string;
};

async function loadDashboardAuthHandoff(): Promise<DashboardAuthHandoffModule> {
  return (await import(HANDOFF_MODULE.href)) as DashboardAuthHandoffModule;
}

describe('Contract: landing redirects into dashboard in-app auth', () => {
  it('landing builds dashboard-owned login URLs for in-app auth', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoffUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        returnTo: '/dashboard/turnos?view=week'
      })
    );

    expect(handoffUrl.origin).toBe('https://dashboard.orvel.pro');
    expect(handoffUrl.pathname).toBe('/auth/login');
    expect(handoffUrl.searchParams.get('returnTo')).toBe('/dashboard/turnos?view=week');
  });

  it('handoff helper falls back to dashboard home and never encodes token-bearing returnTo values', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    for (const returnTo of [
      'https://evil.example/dashboard',
      '//evil.example/dashboard',
      'javascript:alert(1)',
      '/auth/login?returnTo=/dashboard',
      '/dashboard/inicio?code=auth-code',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio#refresh_token=secret',
      '/dashboard/inicio#code=auth-code'
    ]) {
      const handoff = buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        returnTo
      });
      const parsed = new URL(handoff);

      expect(parsed.origin).toBe('https://dashboard.orvel.pro');
      expect(parsed.searchParams.get('returnTo')).toBe('/');
      expect(handoff).not.toMatch(/access_token|refresh_token|id_token|token|code/i);
    }
  });

  it('signup completion and onboarding pages redirect into dashboard in-app signup', async () => {
    const source = `${await readFile(SIGNUP_COMPLETE_PAGE, 'utf8')}\n${await readFile(SIGNUP_ONBOARDING_PAGE, 'utf8')}`;
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const fallbackHandoff = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: '',
        mode: 'signup',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(fallbackHandoff.origin).toBe('https://dashboard.orvel.pro');
    expect(fallbackHandoff.pathname).toBe('/auth/signup');
    expect(fallbackHandoff.searchParams.get('returnTo')).toBe('/dashboard/inicio');
    expect(source).toMatch(/buildInAppAuthRedirect/);
    expect(source).toMatch(/Astro\.redirect/);
    expect(source).not.toContain('name="password"');
  });

  it('keeps dashboard.orvel.pro as the in-app auth host', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoffUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro',
        mode: 'login',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(handoffUrl.origin).toBe('https://dashboard.orvel.pro');
    expect(handoffUrl.pathname).toBe('/auth/login');
    expect(handoffUrl.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });

  it('canonical landing login is a redirect, not an email/password form', async () => {
    const pageSource = await readFile(LOGIN_PAGE, 'utf8');

    expect(pageSource).toMatch(/buildInAppAuthRedirect/);
    expect(pageSource).toMatch(/Astro\.redirect/);
    expect(pageSource).not.toContain('name="email"');
    expect(pageSource).not.toContain('name="password"');
    expect(pageSource).not.toContain('id="googleBtn"');
    expect(pageSource).not.toContain('signInWithOAuth');
  });

  it('removes obsolete callback behavior while keeping token stripping in returnTo sanitization', async () => {
    const returnToSource = await readFile(new URL('../lib/auth-return-to.ts', import.meta.url), 'utf8');

    expect(returnToSource).toMatch(/PARAM_BLOCKLIST[\s\S]*code[\s\S]*access_token|PARAM_BLOCKLIST[\s\S]*access_token[\s\S]*code/);
  });

  it('landing bare /auth exists as a compatibility redirect to /auth/login preserving query params', async () => {
    const source = await readFile(AUTH_COMPAT_PAGE, 'utf8');

    expect(source).toContain("Astro.redirect('/auth/login'");
    expect(source).toContain('Astro.url.search');
  });
});
