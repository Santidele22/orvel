import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const AUTH_FLOW_MODULE = new URL('../../core/auth/dashboard-auth-flow.ts', import.meta.url);
const LOGIN_PAGE = new URL('../../pages/auth/login.page.ts', import.meta.url);

type DashboardAuthFlowModule = {
  normalizeDashboardAuthRequest: (url: string | URL) => {
    mode: 'login' | 'signup';
    source?: 'subscription';
    returnTo: string;
  };
  resolveDashboardAuthSuccessRedirect: (input: { returnTo?: string | null }) => string;
};

async function loadDashboardAuthFlow(): Promise<DashboardAuthFlowModule> {
  try {
    return (await import(AUTH_FLOW_MODULE.href)) as DashboardAuthFlowModule;
  } catch (error) {
    throw new Error(
      `Expected dashboard auth flow helper at src/app/core/auth/dashboard-auth-flow.ts. Original error: ${String(error)}`
    );
  }
}

describe('RED Contract: dashboard /auth subscription source normalization', () => {
  it('accepts source=subscription only as optional context while preserving normal login mode and safe returnTo', async () => {
    const { normalizeDashboardAuthRequest } = await loadDashboardAuthFlow();

    expect(
      normalizeDashboardAuthRequest('/auth?mode=login&source=subscription&returnTo=%2Fdashboard%2Finicio%3Ffrom%3Dsubscription')
    ).toEqual({
      mode: 'login',
      source: 'subscription',
      returnTo: '/dashboard/inicio?from=subscription'
    });

    expect(normalizeDashboardAuthRequest('/auth?mode=login&source=marketing&returnTo=%2Fdashboard')).toEqual({
      mode: 'login',
      returnTo: '/dashboard'
    });
  });

  it('does not let subscription/provider identifiers or oauth/token material survive returnTo normalization', async () => {
    const { normalizeDashboardAuthRequest, resolveDashboardAuthSuccessRedirect } = await loadDashboardAuthFlow();

    for (const unsafeReturnTo of [
      '/dashboard/inicio?preapproval_id=mp-preapproval-123',
      '/dashboard/inicio?collection_id=123&payment_id=456',
      '/dashboard/inicio?access_token=secret',
      '/dashboard/inicio?refresh_token=secret',
      '/dashboard/inicio?token=secret',
      '/dashboard/inicio?code=oauth-code',
      '/dashboard/inicio#refresh_token=secret'
    ]) {
      const url = `/auth?mode=login&source=subscription&returnTo=${encodeURIComponent(unsafeReturnTo)}`;

      expect(normalizeDashboardAuthRequest(url)).toEqual({
        mode: 'login',
        source: 'subscription',
        returnTo: '/dashboard/inicio'
      });
      expect(resolveDashboardAuthSuccessRedirect({ returnTo: unsafeReturnTo })).toBe('/dashboard/inicio');
    }
  });

  it('requires the normal Supabase login/session path even when source=subscription is present', async () => {
    const source = await readFile(LOGIN_PAGE, 'utf8');

    expect(source).toContain('createSupabaseAuthClient');
    expect(source).toContain('signInWithPassword');
    expect(source).toContain('handleLoginSuccess');

    expect(source).not.toMatch(/source\s*===\s*['"]subscription['"][\s\S]*(authenticated|entitlement|plan|onboardingCompleted)/i);
    expect(source).not.toMatch(/subscription[\s\S]*(auth\.updateUser|setCurrentStep\([^)]*dashboard[^)]*\))/i);
  });
});
