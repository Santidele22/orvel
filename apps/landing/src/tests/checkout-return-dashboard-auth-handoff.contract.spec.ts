import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const HANDOFF_MODULE = new URL('../lib/dashboard-auth-handoff.ts', import.meta.url);
const TEST_CHECKOUT_PAGE = new URL('../pages/billing/test-checkout.astro', import.meta.url);

type DashboardAuthHandoffModule = {
  buildDashboardAuthUrl: (input: {
    dashboardOrigin: string;
    mode: 'login' | 'signup';
    source?: 'checkout';
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

describe('RED Contract: checkout return normalization handoff from landing', () => {
  it('builds checkout-approved dashboard /auth handoff with source=checkout and a safe returnTo', async () => {
    const { buildDashboardAuthUrl } = await loadDashboardAuthHandoff();

    const handoff = new URL(
      buildDashboardAuthUrl({
        dashboardOrigin: 'https://orvel-dashboard.vercel.app/',
        mode: 'login',
        source: 'checkout',
        returnTo: '/dashboard/inicio?from=checkout'
      })
    );

    expect(handoff.origin).toBe('https://orvel-dashboard.vercel.app');
    expect(handoff.pathname).toBe('/auth');
    expect(handoff.searchParams.get('mode')).toBe('login');
    expect(handoff.searchParams.get('source')).toBe('checkout');
    expect(handoff.searchParams.get('returnTo')).toBe('/dashboard/inicio?from=checkout');
  });

  it('does not propagate checkout/provider identifiers, oauth codes, or token material into dashboard auth URL', async () => {
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
        dashboardOrigin: 'https://orvel-dashboard.vercel.app',
        mode: 'login',
        source: 'checkout',
        returnTo: unsafeReturnTo
      });
      const parsed = new URL(handoff);

      expect(parsed.searchParams.get('returnTo')).toBe('/');
      expect(handoff).not.toMatch(/preapproval_id|collection_id|payment_id|access_token|refresh_token|token=|code=/i);
    }
  });

  it('treats source=checkout as UX context only and does not trust it for auth, payment verification, or entitlement grant', async () => {
    const source = await readFile(TEST_CHECKOUT_PAGE, 'utf8');

    expect(source).toContain('buildDashboardAuthUrl');
    expect(source).toContain("source: 'checkout'");
    expect(source).toContain("mode: 'login'");

    expect(source).not.toContain('signupWithProvider');
    expect(source).not.toContain('createSupabaseSignupAdapterFromEnv');
    expect(source).not.toContain('auth.updateUser');
    expect(source).not.toMatch(/data:\s*\{[\s\S]*plan[\s\S]*onboardingCompleted/i);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*dashboardHome/);
  });

  it('keeps cancel, pending, and failure checkout states on landing without auto-granting dashboard access', async () => {
    const source = await readFile(TEST_CHECKOUT_PAGE, 'utf8');

    expect(source).toContain("setUiState('pending')");
    expect(source).toContain("setUiState('failed')");
    expect(source).toContain("setUiState('cancelled')");

    const statusHandlingOnly = source.slice(
      source.indexOf("const paymentStatus"),
      source.indexOf('const normalizedCheckoutError')
    );

    expect(statusHandlingOnly).not.toMatch(/window\.location|dashboard|auth\.updateUser|signupWithProvider/i);
  });
});
