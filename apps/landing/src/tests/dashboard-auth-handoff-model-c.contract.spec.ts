import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const LOGIN_PAGE = new URL('../pages/auth/login.astro', import.meta.url);
const CALLBACK_PAGE = new URL('../pages/auth/callback.astro', import.meta.url);
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

  it('canonical landing login owns Google and email/password Supabase auth', async () => {
    const source = await readFile(LOGIN_PAGE, 'utf8');

    expect(source).toContain("from '../../lib/auth-provider'");
    expect(source).toMatch(/loginWithProvider\(/);
    expect(source).toMatch(/loginWithGoogle\(/);
    expect(source).toMatch(/createSupabaseLoginAdapterFromEnv\(/);
    expect(source).toContain('name="email"');
    expect(source).toContain('name="password"');
    expect(source).not.toContain("from '../../lib/dashboard-auth-handoff'");
    expect(source).not.toContain('buildDashboardAuthUrl');
    expect(source).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
  });

  it('landing OAuth callback exchanges provider code on landing, then redirects to sanitized dashboard returnTo', async () => {
    const source = await readFile(CALLBACK_PAGE, 'utf8');

    expect(source).toMatch(/auth\.exchangeCodeForSession\(code\)/);
    expect(source).toMatch(/sanitizeReturnTo/);
    expect(source).toMatch(/PARAM_BLOCKLIST[\s\S]*code[\s\S]*access_token|PARAM_BLOCKLIST[\s\S]*access_token[\s\S]*code/);
    expect(source).not.toMatch(/localStorage\.setItem\([^)]*(token|session|auth)/i);
  });
});
