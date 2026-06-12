import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const ROUTES_SOURCE = new URL('../../app.routes.ts', import.meta.url);
const AUTH_FLOW_MODULE = new URL('../../core/auth/dashboard-auth-flow.ts', import.meta.url);

type DashboardAuthFlowModule = {
  normalizeDashboardAuthRequest: (url: string | URL) => { mode: 'login' | 'signup'; returnTo: string };
  resolveDashboardAuthSuccessRedirect: (input: { returnTo?: string | null }) => string;
};

async function readRoutesSource(): Promise<string> {
  return readFile(ROUTES_SOURCE, 'utf8');
}

function extractTopLevelRoute(source: string, path: string): string | undefined {
  const routeMatch = source.match(new RegExp(`path:\\s*['"]${path}['"][\\s\\S]*?(?=\\n\\s*\\},\\n\\s*\\{|\\n\\s*\\}\\n\\];)`));
  return routeMatch?.[0];
}

function extractAppRootRedirect(source: string): string | undefined {
  const routeMatch = source.match(/\{\s*path:\s*['"]['"],\s*redirectTo:\s*['"]([^'"]+)['"],\s*pathMatch:\s*['"]full['"]\s*\}\s*\];/);
  return routeMatch?.[1];
}

async function loadDashboardAuthFlow(): Promise<DashboardAuthFlowModule> {
  return (await import(AUTH_FLOW_MODULE.href)) as DashboardAuthFlowModule;
}

describe('Contract: dashboard auth routes delegate to canonical landing auth', () => {
  it('/auth is a bridge route and does not own credential auth UI', async () => {
    const source = await readRoutesSource();
    const authRoute = extractTopLevelRoute(source, 'auth');
    const authLoginRoute = extractTopLevelRoute(source, 'auth/login') ?? '';

    expect(authRoute, 'Expected dashboard /auth bridge route.').toBeDefined();
    expect(authRoute).toMatch(/loadComponent:\s*\(\)\s*=>\s*import\(['"]\.\/pages\/auth\/login\.page['"]\)/);
    expect(authRoute).not.toContain('redirectTo');
    expect(authRoute).not.toContain('canActivate');
    expect(authRoute).not.toMatch(/component:\s*LoginPage|signInWithPassword|signUp|getMockUser|generateToken/);
    expect(authLoginRoute).not.toContain('canActivate');
    expect(authLoginRoute).not.toMatch(/signInWithPassword|signUp|getMockUser|generateToken/);
  });

  it('normalizes login/signup handoff hints but does not treat them as credentials', async () => {
    const { normalizeDashboardAuthRequest } = await loadDashboardAuthFlow();

    expect(normalizeDashboardAuthRequest('/auth?mode=login&returnTo=%2Fdashboard%2Finicio')).toEqual({
      mode: 'login',
      returnTo: '/dashboard/inicio'
    });
    expect(normalizeDashboardAuthRequest('/auth?mode=signup&returnTo=%2Fdashboard%2Finicio')).toEqual({
      mode: 'signup',
      returnTo: '/dashboard/inicio'
    });
  });

  it('sanitizes auth handoff returnTo and never propagates token params', async () => {
    const { normalizeDashboardAuthRequest, resolveDashboardAuthSuccessRedirect } = await loadDashboardAuthFlow();

    for (const unsafeReturnTo of [
      'https://evil.example/dashboard',
      '//evil.example/dashboard',
      'javascript:alert(1)',
      '/auth?mode=login',
      '/auth/login?returnTo=/dashboard',
      '/dashboard/inicio#access_token=secret',
      '/dashboard/inicio?code=oauth-code'
    ]) {
      expect(normalizeDashboardAuthRequest(`/auth?mode=login&returnTo=${encodeURIComponent(unsafeReturnTo)}`)).toEqual({
        mode: 'login',
        returnTo: '/dashboard/inicio'
      });
      expect(resolveDashboardAuthSuccessRedirect({ returnTo: unsafeReturnTo })).toBe('/dashboard/inicio');
    }
  });

  it('/auth/login redirects/delegates to landing canonical auth and has no credential form contract', async () => {
    const loginPage = await readFile(new URL('../../pages/auth/login.page.ts', import.meta.url), 'utf8');
    const loginTemplate = await readFile(new URL('../../pages/auth/login.page.html', import.meta.url), 'utf8');

    expect(loginPage).toMatch(/canonicalLandingAuth|buildLandingLoginRedirect|window\.location\.assign/);
    expect(loginPage).toContain("const canonicalLandingSignup = '/auth/signup/plan'");
    expect(loginPage).not.toMatch(/router\.navigate\(\['\/auth\/signup\/plan'\]/);
    expect(loginPage).toMatch(/CANONICAL_LANDING_ORIGIN\s*=\s*['"]https:\/\/orvel\.pro['"]/);
    expect(loginPage).toMatch(/PUBLIC_LANDING_URL/);
    expect(loginPage).not.toMatch(/signInWithPassword|signUp|createSupabaseAuthClient|SUPABASE_CONFIG|getMockUser|generateToken/);
    expect(loginTemplate).not.toMatch(/<form[\s\S]*ngSubmit|name=['"]email['"]|name=['"]password['"]/);
  });

  it('protected /dashboard/** still requires Supabase session and redirects unauthenticated users to landing auth', async () => {
    const source = await readRoutesSource();
    const dashboardRoute = extractTopLevelRoute(source, 'dashboard') ?? '';
    const routeProtection = await readFile(new URL('../../core/auth/route-protection.ts', import.meta.url), 'utf8');

    expect(dashboardRoute).toMatch(/canActivate:\s*\[dashboardAuthGuard\]/);
    expect(dashboardRoute).toMatch(/canActivateChild:\s*\[dashboardAuthChildGuard\]/);
    expect(routeProtection).toMatch(/getSession\(\)/);
    expect(routeProtection).toMatch(/LOGIN_ROUTE\s*=\s*['"]\/auth\/login['"]/);
    expect(routeProtection).not.toMatch(/localStorage\.getItem\([\s\S]{0,240}allowed:\s*true/);
  });

  it('dashboard app root redirects to the guarded visible dashboard home', async () => {
    const source = await readRoutesSource();
    const rootRedirect = extractAppRootRedirect(source);

    expect(rootRedirect, 'Expected dashboard app root route with pathMatch full.').toBeDefined();
    expect(rootRedirect).toBe('dashboard/inicio');
  });
});
