import { readFile } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';

const ROUTES_SOURCE = new URL('../../app.routes.ts', import.meta.url);
const LOGIN_ROUTER_HELPER_SOURCE = new URL('../../pages/auth/login.router-helper.ts', import.meta.url);
const LOGIN_ROUTER_HELPER_MODULE = new URL('../../pages/auth/login.router-helper.ts', import.meta.url);
const AUTH_FLOW_MODULE = new URL('../../core/auth/dashboard-auth-flow.ts', import.meta.url);

type DashboardAuthFlowModule = {
  normalizeDashboardAuthRequest: (url: string | URL) => { mode: 'login' | 'signup'; returnTo: string };
  resolveDashboardAuthSuccessRedirect: (input: { returnTo?: string | null }) => string;
};

type LoginRouterHelperModule = {
  handleLoginSuccess: (options: {
    router: { navigate: (commands: unknown[]) => Promise<boolean> };
    returnTo: string | null;
    session?: unknown;
  }) => Promise<void>;
};

async function readRoutesSource(): Promise<string> {
  return readFile(ROUTES_SOURCE, 'utf8');
}

function extractTopLevelRoute(source: string, path: string): string | undefined {
  const routeMatch = source.match(new RegExp(`path:\\s*['"]${path}['"][\\s\\S]*?(?=\\n\\s*\\},\\n\\s*\\{|\\n\\s*\\}\\n\\];)`));
  return routeMatch?.[0];
}

async function loadDashboardAuthFlow(): Promise<DashboardAuthFlowModule> {
  return (await import(AUTH_FLOW_MODULE.href)) as DashboardAuthFlowModule;
}

async function loadLoginRouterHelper(): Promise<LoginRouterHelperModule> {
  return (await import(LOGIN_ROUTER_HELPER_MODULE.href)) as LoginRouterHelperModule;
}

describe('RED Contract: dashboard /auth real Supabase auth flow', () => {
  it('/auth?mode=login&returnTo=/dashboard/inicio resolves to public login/auth experience', async () => {
    const source = await readRoutesSource();
    const authRoute = extractTopLevelRoute(source, 'auth');
    const { normalizeDashboardAuthRequest } = await loadDashboardAuthFlow();

    expect(authRoute, 'Expected dashboard-owned public /auth route.').toBeDefined();
    expect(authRoute).toContain('LoginPage');
    expect(authRoute).not.toMatch(/dashboardAuthGuard|dashboardAuthChildGuard|canActivate|onboarding[A-Za-z]+Guard/);
    expect(normalizeDashboardAuthRequest('/auth?mode=login&returnTo=%2Fdashboard%2Finicio')).toEqual({
      mode: 'login',
      returnTo: '/dashboard/inicio'
    });
  });

  it('/auth?mode=signup&returnTo=/ resolves to signup/auth experience or explicit signup mode behavior', async () => {
    const source = await readRoutesSource();
    const authRoute = extractTopLevelRoute(source, 'auth') ?? '';
    const { normalizeDashboardAuthRequest } = await loadDashboardAuthFlow();

    expect(normalizeDashboardAuthRequest('/auth?mode=signup&returnTo=%2F')).toEqual({ mode: 'signup', returnTo: '/' });
    expect(
      authRoute,
      'The public /auth entrypoint must branch on mode=signup instead of always rendering login.'
    ).toMatch(/normalizeDashboardAuthRequest|DashboardAuth|SignupCredentialsPageComponent|SignupPlanStepPageComponent/);
  });

  it('auth success redirect delegates to resolveDashboardAuthSuccessRedirect and never propagates token params', async () => {
    const source = await readFile(LOGIN_ROUTER_HELPER_SOURCE, 'utf8');
    const { resolveDashboardAuthSuccessRedirect } = await loadDashboardAuthFlow();
    const { handleLoginSuccess } = await loadLoginRouterHelper();
    const router = { navigate: vi.fn().mockResolvedValue(true) };
    const unsafeReturnTo = '/dashboard/inicio?access_token=secret&refresh_token=secret';

    expect(source).toMatch(/resolveDashboardAuthSuccessRedirect/);
    expect(resolveDashboardAuthSuccessRedirect({ returnTo: unsafeReturnTo })).toBe('/');

    await handleLoginSuccess({ router, returnTo: unsafeReturnTo, session: null });

    const navigatedTo = router.navigate.mock.calls[0]?.[0]?.[0];
    expect(navigatedTo).toBe('/');
    expect(String(navigatedTo)).not.toMatch(/access_token|refresh_token|id_token|token|code/i);
  });

  it('unsafe returnTo values fall back to safe dashboard home', async () => {
    const { normalizeDashboardAuthRequest, resolveDashboardAuthSuccessRedirect } = await loadDashboardAuthFlow();

    for (const unsafeReturnTo of [
      'https://evil.example/dashboard',
      '//evil.example/dashboard',
      'javascript:alert(1)',
      '/auth?mode=login',
      '/dashboard/inicio#access_token=secret',
      '/dashboard/inicio?code=oauth-code'
    ]) {
      expect(normalizeDashboardAuthRequest(`/auth?mode=login&returnTo=${encodeURIComponent(unsafeReturnTo)}`)).toEqual({
        mode: 'login',
        returnTo: '/'
      });
      expect(resolveDashboardAuthSuccessRedirect({ returnTo: unsafeReturnTo })).toBe('/');
    }
  });

  it('public /auth does not require onboarding metadata before rendering auth UI', async () => {
    const source = await readRoutesSource();
    const authRoute = extractTopLevelRoute(source, 'auth') ?? '';

    expect(authRoute).toBeTruthy();
    expect(authRoute).not.toMatch(/onboardingLoginGuard|onboardingAccountGuard|onboardingBusinessTypesGuard|onboardingWelcomeGuard/);
    expect(authRoute).not.toMatch(/hasCompletedMandatoryOnboarding|onboardingCompleted|businessType|tipoNegocio/);
  });

  it('protected /dashboard/** still requires Supabase session and redirects unauthenticated users to landing auth', async () => {
    const source = await readRoutesSource();
    const dashboardRoute = extractTopLevelRoute(source, 'dashboard') ?? '';
    const routeProtection = await readFile(new URL('../../core/auth/route-protection.ts', import.meta.url), 'utf8');

    expect(dashboardRoute).toMatch(/canActivate:\s*\[dashboardAuthGuard\]/);
    expect(dashboardRoute).toMatch(/canActivateChild:\s*\[dashboardAuthChildGuard\]/);
    expect(routeProtection).toMatch(/getSession\(\)/);
    expect(routeProtection).toMatch(/buildLandingLoginRedirect\('\/dashboard'\)|buildLandingLoginRedirect\("\/dashboard"\)/);
  });
});
