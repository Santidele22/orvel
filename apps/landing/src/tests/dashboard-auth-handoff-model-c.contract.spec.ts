import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const LOGIN_PAGE = new URL('../pages/auth/login.astro', import.meta.url);
const AUTH_COMPAT_PAGE = new URL('../pages/auth.astro', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SIGNUP_ONBOARDING_PAGE = new URL('../pages/auth/signup/onboarding.astro', import.meta.url);
const LOGIN_CONTROLLER = new URL('../lib/login-page-controller.ts', import.meta.url);
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

describe('Contract: canonical landing auth and dashboard handoff', () => {
  it('landing builds landing-owned login URLs only as sanitized post-auth handoff hints', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoffUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        returnTo: '/dashboard/turnos?view=week'
      })
    );

    expect(handoffUrl.origin).toBe('https://orvel.pro');
    expect(handoffUrl.pathname).toBe('/auth/login');
    expect(handoffUrl.pathname).not.toBe('/dashboard/auth');
    expect(handoffUrl.searchParams.get('mode')).toBe('login');
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

      expect(parsed.searchParams.get('returnTo')).toBe('/');
      expect(handoff).not.toMatch(/access_token|refresh_token|id_token|token|code/i);
    }
  });

  it('free signup completion uses landing-owned onboarding, not dashboard-owned auth', async () => {
    const source = `${await readFile(SIGNUP_COMPLETE_PAGE, 'utf8')}\n${await readFile(SIGNUP_ONBOARDING_PAGE, 'utf8')}`;
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    // Landing owns signup onboarding before redirecting back to login/dashboard auth.
    const fallbackHandoff = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: '',
        mode: 'signup',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(fallbackHandoff.origin).toBe('https://dashboard.orvel.pro');
    expect(fallbackHandoff.pathname).toBe('/auth/signup/plan');
    expect(fallbackHandoff.pathname).not.toBe('/dashboard/auth');
    expect(fallbackHandoff.searchParams.get('returnTo')).toBe('/dashboard/inicio');
    expect(source).toContain('/auth/signup/onboarding');
    expect(source).not.toContain("new URL('/auth/onboarding', dashboardOrigin)");
    expect(source).toContain('plan=${encodeURIComponent(plan)}');
    expect(source).toContain('billing=${encodeURIComponent(billing)}');
    expect(source).not.toContain('buildDashboardAuthUrl({');
    expect(source).not.toContain("window.location.href = '/dashboard/inicio'");
  });

  it('keeps the landing root as the auth base and rejects dashboard-owned /dashboard/auth', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoffUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro',
        mode: 'login',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(handoffUrl.href).not.toBe('https://orvel.pro/dashboard/auth?mode=login&returnTo=%2Fdashboard%2Finicio');
    expect(handoffUrl.origin).toBe('https://orvel.pro');
    expect(handoffUrl.pathname).toBe('/auth/login');
    expect(handoffUrl.pathname).not.toBe('/dashboard/auth');
    expect(handoffUrl.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });

  it('canonical landing login owns email/password auth and exposes no Google OAuth entrypoint', async () => {
    const pageSource = await readFile(LOGIN_PAGE, 'utf8');
    const controllerSource = await readFile(LOGIN_CONTROLLER, 'utf8');
    const source = `${pageSource}\n${controllerSource}`;

    expect(source).toMatch(/from ['"](?:\.\/auth-provider|\.\.\/\.\.\/lib\/auth-provider)['"]/);
    expect(source).toMatch(/loginWithProvider\(/);
    expect(pageSource).not.toContain('id="googleBtn"');
    expect(pageSource).not.toContain("document.getElementById('googleBtn')");
    expect(pageSource).not.toMatch(/Continuar\s+con\s+Google|Google disponible|Registrarse\s+con\s+Google/i);
    expect(source).not.toContain('loginWithGoogle');
    expect(source).not.toContain('createSupabaseOAuthAdapter');
    expect(source).not.toContain('signInWithOAuth');
    expect(source).toMatch(/createSupabaseLoginAdapterFromEnv\(/);
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).not.toContain("from '../../lib/dashboard-auth-handoff'");
    expect(source).not.toContain('buildDashboardAuthUrl');
    expect(source).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
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
