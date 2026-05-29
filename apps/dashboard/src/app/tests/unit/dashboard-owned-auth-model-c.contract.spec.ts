import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ROUTES_SOURCE = new URL('../../app.routes.ts', import.meta.url);
const AUTH_FLOW_MODULE = new URL('../../core/auth/dashboard-auth-flow.ts', import.meta.url);

type DashboardAuthFlowModule = {
  normalizeDashboardAuthRequest: (url: string | URL) => { mode: 'login' | 'signup'; returnTo: string };
  resolveDashboardAuthSuccessRedirect: (input: { returnTo?: string | null }) => string;
};

async function loadDashboardAuthFlow(): Promise<DashboardAuthFlowModule> {
  try {
    return (await import(AUTH_FLOW_MODULE.href)) as DashboardAuthFlowModule;
  } catch (error) {
    throw new Error(
      `Expected dashboard-owned auth flow helpers at src/app/core/auth/dashboard-auth-flow.ts. Original error: ${String(error)}`
    );
  }
}

describe('RED Contract: Model C dashboard-owned auth route', () => {
  it('exposes /auth as a public route and does not attach dashboard/onboarding auth guards to it', async () => {
    const source = await readFile(ROUTES_SOURCE, 'utf8');
    const authRouteMatch = source.match(/path:\s*['"]auth['"][\s\S]*?(?=\n\s*\},\n\s*\{|\n\s*\}\n\];)/);

    expect(authRouteMatch?.[0], 'Expected a first-class dashboard /auth route.').toBeDefined();
    expect(authRouteMatch?.[0]).not.toContain('dashboardAuthGuard');
    expect(authRouteMatch?.[0]).not.toContain('dashboardAuthChildGuard');
    expect(authRouteMatch?.[0]).not.toContain('onboardingLoginGuard');
    expect(authRouteMatch?.[0]).not.toContain('canActivate');
  });

  it('normalizes mode=login|signup and preserves a safe dashboard returnTo', async () => {
    const { normalizeDashboardAuthRequest } = await loadDashboardAuthFlow();

    expect(normalizeDashboardAuthRequest('/auth?mode=login&returnTo=%2Fdashboard%2Fturnos%3Fview%3Dweek')).toEqual({
      mode: 'login',
      returnTo: '/dashboard/turnos?view=week'
    });

    expect(normalizeDashboardAuthRequest('/auth?mode=signup&returnTo=%2Fdashboard%2Fconfiguracion')).toEqual({
      mode: 'signup',
      returnTo: '/dashboard/configuracion'
    });
  });

  it('falls back to dashboard home when mode or returnTo is unsafe', async () => {
    const { normalizeDashboardAuthRequest, resolveDashboardAuthSuccessRedirect } = await loadDashboardAuthFlow();

    for (const unsafeReturnTo of [
      'https://evil.example/dashboard',
      'http://evil.example/dashboard',
      '//evil.example/dashboard',
      'javascript:alert(1)',
      '/auth?mode=login',
      '/auth/callback#access_token=leaked&refresh_token=leaked'
    ]) {
      const url = `/auth?mode=magic-link&returnTo=${encodeURIComponent(unsafeReturnTo)}`;
      expect(normalizeDashboardAuthRequest(url)).toEqual({ mode: 'login', returnTo: '/' });
      expect(resolveDashboardAuthSuccessRedirect({ returnTo: unsafeReturnTo })).toBe('/');
    }
  });

  it('redirects successful login/signup to sanitized returnTo or dashboard home without token material', async () => {
    const { resolveDashboardAuthSuccessRedirect } = await loadDashboardAuthFlow();

    expect(resolveDashboardAuthSuccessRedirect({ returnTo: '/dashboard/clientes?from=landing' })).toBe(
      '/dashboard/clientes?from=landing'
    );
    expect(resolveDashboardAuthSuccessRedirect({ returnTo: null })).toBe('/');

    const redirect = resolveDashboardAuthSuccessRedirect({
      returnTo: '/dashboard/inicio?access_token=secret&refresh_token=secret'
    });

    expect(redirect).toBe('/');
    expect(redirect).not.toMatch(/access_token|refresh_token/i);
  });
});
