import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const LOGIN_PAGE = new URL('../pages/auth/login.astro', import.meta.url);
const AUTH_COMPAT_PAGE = new URL('../pages/auth.astro', import.meta.url);
const CALLBACK_PAGE = new URL('../pages/auth/callback.astro', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const HANDOFF_MODULE = new URL('../lib/dashboard-auth-handoff.ts', import.meta.url);

type DashboardAuthHandoffModule = {
  buildDashboardAuthUrl: (input: {
    dashboardOrigin: string;
    mode: 'login' | 'signup';
    returnTo?: string | null;
  }) => string;
};

type SupabaseAuthAdapterModule = {
  createSupabaseOAuthAdapter: (
    env: { SUPABASE_URL?: string; SUPABASE_ANON_KEY?: string },
    dependencies: {
      createClient: (url: string, anonKey: string, options?: unknown) => {
        auth: {
          signInWithOAuth: (input: unknown) => Promise<{ error: null }>;
        };
      };
    }
  ) => (provider: 'google', input: string | { redirectTo: string }) => Promise<{ ok: boolean }>;
};

async function loadDashboardAuthHandoff(): Promise<DashboardAuthHandoffModule> {
  return (await import(HANDOFF_MODULE.href)) as DashboardAuthHandoffModule;
}

async function loadSupabaseAuthAdapter(): Promise<SupabaseAuthAdapterModule> {
  return (await import('../lib/supabase-auth-adapter.ts')) as SupabaseAuthAdapterModule;
}

describe('Contract: canonical landing auth and dashboard handoff', () => {
  it('landing builds dashboard /auth bridge URLs only as sanitized post-auth handoff hints', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoffUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        returnTo: '/dashboard/turnos?view=week'
      })
    );

    expect(handoffUrl.origin).toBe('https://orvel.pro');
    expect(handoffUrl.pathname).toBe('/dashboard/auth');
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
      '/dashboard/inicio?code=oauth-code',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio#refresh_token=secret',
      '/dashboard/inicio#code=oauth-code'
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

  it('free signup completion builds dashboard handoff from dashboard origin, never landing origin', async () => {
    const source = await readFile(SIGNUP_COMPLETE_PAGE, 'utf8');
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const fallbackHandoff = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: '',
        mode: 'signup',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(fallbackHandoff.origin).toBe('http://localhost:4200');
    expect(fallbackHandoff.pathname).toBe('/auth');
    expect(fallbackHandoff.searchParams.get('returnTo')).toBe('/dashboard/inicio');
    expect(source).toContain('buildDashboardAuthUrl({');
    expect(source).not.toContain('|| window.location.origin');
    expect(source).not.toContain("window.location.href = '/dashboard/inicio'");
    expect(source).not.toContain('window.location.href = returnTo;');
  });

  it('rejects the landing root as a dashboard bridge base so handoff never becomes landing /auth', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoffUrl = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro',
        mode: 'login',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(handoffUrl.href).not.toBe('https://orvel.pro/auth?mode=login&returnTo=%2Fdashboard%2Finicio');
    expect(handoffUrl.origin).toBe('http://localhost:4200');
    expect(handoffUrl.pathname).toBe('/auth');
    expect(handoffUrl.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });

  it('canonical landing login owns Google and email/password Supabase auth', async () => {
    const source = await readFile(LOGIN_PAGE, 'utf8');

    expect(source).toContain("from '../../lib/auth-provider'");
    expect(source).toMatch(/loginWithProvider\(/);
    expect(source).toMatch(/loginWithGoogle\(/);
    expect(source).toContain("new URL('/auth/callback', window.location.origin)");
    expect(source).toContain('loginWithGoogle({ redirectTo: callbackUrl.toString() })');
    expect(source).not.toMatch(/loginWithGoogle\(\s*['"]\/auth['"]\s*\)/);
    expect(source).toMatch(/createSupabaseLoginAdapterFromEnv\(/);
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).not.toContain("from '../../lib/dashboard-auth-handoff'");
    expect(source).not.toContain('buildDashboardAuthUrl');
    expect(source).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
  });

  it('landing OAuth callback exchanges provider code on landing, then redirects to sanitized dashboard returnTo', async () => {
    const source = await readFile(CALLBACK_PAGE, 'utf8');
    const returnToSource = await readFile(new URL('../lib/auth-return-to.ts', import.meta.url), 'utf8');

    expect(source).toMatch(/auth\.exchangeCodeForSession\(code\)/);
    expect(source).toMatch(/sanitizeLandingAuthReturnTo/);
    expect(returnToSource).toMatch(/PARAM_BLOCKLIST[\s\S]*code[\s\S]*access_token|PARAM_BLOCKLIST[\s\S]*access_token[\s\S]*code/);
    expect(source).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
  });

  it('landing OAuth adapter resolves relative localhost callbacks against the local landing origin, not production', async () => {
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const captured: unknown[] = [];
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { origin: 'http://localhost:4321' } }
    });

    try {
      const { createSupabaseOAuthAdapter } = await loadSupabaseAuthAdapter();
      const oauth = createSupabaseOAuthAdapter(
        { SUPABASE_URL: 'https://supabase.example', SUPABASE_ANON_KEY: 'anon' },
        {
          createClient: () => ({
            auth: {
              signInWithOAuth: async (input: unknown) => {
                captured.push(input);
                return { error: null };
              }
            }
          })
        }
      );

      await oauth('google', { redirectTo: '/auth/callback?returnTo=%2Fdashboard%2Finicio' });

      expect(JSON.stringify(captured)).toContain('http://localhost:4321/auth/callback');
      expect(JSON.stringify(captured)).not.toContain('https://orvel.pro/auth/callback');
    } finally {
      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('landing bare /auth exists as a compatibility redirect to /auth/login preserving query params', async () => {
    const source = await readFile(AUTH_COMPAT_PAGE, 'utf8');

    expect(source).toContain("Astro.redirect('/auth/login'");
    expect(source).toContain('Astro.url.search');
  });
});
