import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const HANDOFF_MODULE = new URL('../lib/dashboard-auth-handoff.ts', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);

type DashboardAuthHandoffModule = {
  buildDashboardAuthUrl: (input: {
    dashboardOrigin: string;
    mode: 'login' | 'signup';
    source?: 'subscription';
    returnTo?: string | null;
  }) => string;
};

async function loadDashboardAuthHandoff(): Promise<DashboardAuthHandoffModule> {
  try {
    return (await import(HANDOFF_MODULE.href)) as DashboardAuthHandoffModule;
  } catch (error) {
    throw new Error(
      `Expected landing dashboard auth handoff helper at src/lib/dashboard-auth-handoff.ts. Original error: ${String(error)}`
    );
  }
}

describe('RED Contract: subscription return normalization handoff from landing', () => {
  it('builds subscription-approved landing auth handoff without depending on dashboard /auth pages', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoff = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        source: 'subscription',
        returnTo: '/dashboard/inicio?from=subscription'
      })
    );

    expect(handoff.origin).toBe('https://orvel.pro');
    expect(handoff.pathname).toBe('/auth/login');
    expect(handoff.pathname).not.toBe('/dashboard/auth');
    expect(handoff.searchParams.get('mode')).toBe('login');
    expect(handoff.searchParams.get('source')).toBe('subscription');
    expect(handoff.searchParams.get('returnTo')).toBe('/dashboard/inicio?from=subscription');
  });

  it('maps signup handoff to landing signup plan instead of dashboard-owned signup pages', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoff = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'signup',
        source: 'subscription',
        returnTo: '/dashboard/inicio'
      })
    );

    expect(handoff.origin).toBe('https://orvel.pro');
    expect(handoff.pathname).toBe('/auth/signup/plan');
    expect(handoff.pathname).not.toMatch(/^\/dashboard\/auth/);
    expect(handoff.searchParams.get('returnTo')).toBe('/dashboard/inicio');
  });

  it('does not propagate subscription/provider identifiers, auth codes, or token material into dashboard auth URL', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    for (const unsafeReturnTo of [
      '/dashboard/inicio?preapproval_id=mp-preapproval-123',
      '/dashboard/inicio?collection_id=123&payment_id=456',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio?refresh_token=secret',
      '/dashboard/inicio?token=secret',
      '/dashboard/inicio?code=auth-code',
      '/dashboard/inicio#access_token=secret',
      'https://evil.example/dashboard?preapproval_id=leak',
      '//evil.example/dashboard?token=leak'
    ]) {
      const handoff = buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel.pro/dashboard',
        mode: 'login',
        source: 'subscription',
        returnTo: unsafeReturnTo
      });
      const parsed = new URL(handoff);

      expect(parsed.searchParams.get('returnTo')).toBe('/');
      expect(handoff).not.toMatch(/preapproval_id|collection_id|payment_id|access_token|refresh_token|token=|code=/i);
    }
  });

  it('treats the alias page as UX only and does not grant entitlements in the browser', async () => {
    const source = await readFile(SUBSCRIPTION_PAGE, 'utf8');

    expect(source).not.toContain('signupWithProvider');
    expect(source).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(source).not.toContain('auth.updateUser');
    expect(source).not.toMatch(/data:\s*\{[\s\S]*plan[\s\S]*onboardingCompleted/i);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*dashboardHome/);
    expect(source).not.toMatch(/plan\s*=\s*['"]PREMIUM['"]/);
  });

  it('keeps the operator on Gratis copy without auto-granting dashboard Premium access', async () => {
    const source = await readFile(SUBSCRIPTION_PAGE, 'utf8');

    expect(source).toContain('plan Gratis');
    expect(source).not.toMatch(/auth\.updateUser|signupWithProvider/i);
  });
});
