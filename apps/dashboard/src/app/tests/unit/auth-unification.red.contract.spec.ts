import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routeBlock = (routesSource: string, path: string) => {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return routesSource.match(new RegExp(`\\{\\s*path:\\s*'${escapedPath}',[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '';
};

describe('RED: auth unification contract', () => {
  it('keeps public booking/manage routes public while dashboard routes remain protected', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const bookingManage = routeBlock(appRoutes, 'booking/manage');
    const publicBooking = routeBlock(appRoutes, 'booking/:slug');
    const dashboard = routeBlock(appRoutes, 'dashboard');

    expect(bookingManage).toContain('loadComponent');
    expect(publicBooking).toContain('loadComponent');
    expect(bookingManage).not.toContain('canActivate');
    expect(publicBooking).not.toContain('canActivate');
    expect(dashboard).toContain('canActivate: [dashboardAuthGuard]');
    expect(dashboard).toContain('canActivateChild: [dashboardAuthChildGuard]');
  });

  it('does not mount an independent dashboard auth/login component for /auth or /auth/login', () => {
    const appRoutes = source('src/app/app.routes.ts');

    expect(appRoutes).not.toMatch(/path:\s*'auth',[\s\S]*?component:\s*LoginPage/);
    expect(appRoutes).not.toMatch(/path:\s*'auth\/login',[\s\S]*?component:\s*LoginPage/);
    expect(appRoutes).toMatch(/path:\s*'auth'|path:\s*'auth\/login'/);
    expect(appRoutes).toMatch(/path:\s*'auth',[\s\S]*?loadComponent:\s*\(\)\s*=>\s*import\('\.\/pages\/auth\/login\.page'\)/);
  });

  it('requires dashboard auth entry points to delegate to canonical landing auth instead of calling Supabase credentials directly', () => {
    const loginPage = source('src/app/pages/auth/login.page.ts');
    const loginTemplate = source('src/app/pages/auth/login.page.html');

    expect(loginPage).not.toContain('createSupabaseAuthClient');
    expect(loginPage).not.toContain('SUPABASE_CONFIG');
    expect(loginPage).not.toMatch(/signInWithPassword|signUp|generateToken|getMockUser/);
    expect(loginPage).toMatch(/buildLandingLoginRedirect|canonicalLandingAuth|window\.location\.assign/);
    expect(loginTemplate).not.toMatch(/<form[^>]+\(ngSubmit\)=['"]onSubmit\(\)['"]/);
  });

  it('redirects unauthenticated protected dashboard access to canonical landing /auth/login with sanitized returnTo', () => {
    const routeProtection = source('src/app/core/auth/route-protection.ts');

    expect(routeProtection).toMatch(/LOGIN_ROUTE\s*=\s*['"]\/auth\/login['"]/);
    expect(routeProtection).toMatch(/PARAM_BLOCKLIST|access_token|refresh_token|id_token/);
    expect(routeProtection).toMatch(/encodeURIComponent\(safeReturnTo\)/);
    expect(routeProtection).not.toMatch(/LOGIN_ROUTE\s*=\s*['"]\/login['"]/);
  });

  it('fails closed for legacy dashboard local/mock auth paths', () => {
    const authService = source('src/app/services/auth.service.ts');
    const sessionContract = source('src/app/core/auth/session-contract.ts');

    expect(authService).not.toMatch(/provider:\s*'mock'|setProvider\(|createMockUser|getMockUser|generateToken|saveSession|loadStoredSession/);
    expect(authService).not.toMatch(/localStorage\.setItem\([^)]*(salon_auth|turnea\.session|token)/i);
    expect(sessionContract).not.toContain('TURNERA_SESSION_KEY');
  });

  it('does not expose secrets in frontend config; only public Supabase anon-key env names are allowed', () => {
    const supabaseConfig = source('src/app/core/auth/supabase-config.ts');
    const dashboardEnv = source('src/app/core/runtime/dashboard-env.ts');

    expect(supabaseConfig).toMatch(/PUBLIC_SUPABASE_URL/);
    expect(supabaseConfig).toMatch(/PUBLIC_SUPABASE_ANON_KEY/);
    expect(supabaseConfig).not.toMatch(/SERVICE_ROLE|SECRET|PRIVATE|NEXT_PUBLIC_SUPABASE/);
    expect(dashboardEnv).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|service[_-]?role/i);
  });

  it('uses the same explicit Supabase auth storage key as landing for same-origin local flow', () => {
    const supabaseConfig = source('src/app/core/auth/supabase-config.ts');
    const supabaseAuthClient = source('src/app/core/auth/supabase-auth.client.ts');

    expect(supabaseConfig).toContain('orvel.supabase.auth');
    expect(supabaseAuthClient).toMatch(/storageKey:\s*ORVEL_SUPABASE_AUTH_STORAGE_KEY/);
  });
});
