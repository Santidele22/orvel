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
  it('builds subscription-approved dashboard /auth handoff with source=subscription and a safe returnTo', async () => {
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
    expect(handoff.pathname).toBe('/dashboard/auth');
    expect(handoff.searchParams.get('mode')).toBe('login');
    expect(handoff.searchParams.get('source')).toBe('subscription');
    expect(handoff.searchParams.get('returnTo')).toBe('/dashboard/inicio?from=subscription');
  });

  it('does not propagate subscription/provider identifiers, oauth codes, or token material into dashboard auth URL', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    for (const unsafeReturnTo of [
      '/dashboard/inicio?preapproval_id=mp-preapproval-123',
      '/dashboard/inicio?collection_id=123&payment_id=456',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio?refresh_token=secret',
      '/dashboard/inicio?token=secret',
      '/dashboard/inicio?code=oauth-code',
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

  it('treats source=subscription as UX context only and does not trust it for auth, payment verification, or entitlement grant', async () => {
    const source = await readFile(SUBSCRIPTION_PAGE, 'utf8');

    expect(source).toContain('buildDashboardAuthUrl');
    expect(source).toContain("source: 'subscription'");
    expect(source).toContain("mode: 'login'");

    expect(source).not.toContain('signupWithProvider');
    expect(source).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(source).not.toContain('auth.updateUser');
    expect(source).not.toMatch(/data:\s*\{[\s\S]*plan[\s\S]*onboardingCompleted/i);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*dashboardHome/);
  });

  it('keeps cancel, pending, and failure subscription states on landing without auto-granting dashboard access', async () => {
    const source = await readFile(SUBSCRIPTION_PAGE, 'utf8');

    expect(source).toContain("setUiState('pending')");
    expect(source).toContain("setUiState('failed')");
    expect(source).toContain("setUiState('cancelled')");

    const statusHandlingOnly = source.slice(
      source.indexOf("const paymentStatus"),
      source.indexOf('const normalizedSubscriptionError')
    );

    expect(statusHandlingOnly).not.toMatch(/window\.location|dashboard|auth\.updateUser|signupWithProvider/i);
  });
});
