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
    const dashboardShell = source('src/app/dashboard-shell.routes.ts');
    const bookingManage = routeBlock(appRoutes, 'booking/manage');
    const publicBooking = routeBlock(appRoutes, 'booking/:slug');

    expect(bookingManage).toContain('loadChildren');
    expect(publicBooking).toContain('loadChildren');
    expect(bookingManage).not.toContain('canActivate');
    expect(publicBooking).not.toContain('canActivate');
    expect(dashboardShell).toContain('canActivate: [dashboardAuthGuard]');
    expect(dashboardShell).toContain('canActivateChild: [dashboardAuthChildGuard]');
  });

  it('mounts public dashboard/login before the guarded dashboard and does not remount landing auth pages', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const signIn = routeBlock(appRoutes, 'dashboard/login');
    const signInIndex = appRoutes.search(/path:\s*'dashboard\/login'/);
    const dashboardIndex = appRoutes.search(/path:\s*'dashboard'\s*,/);

    expect(signIn).toContain('loadComponent');
    expect(signIn).not.toContain('canActivate');
    expect(signInIndex).toBeGreaterThan(-1);
    expect(signInIndex).toBeLessThan(dashboardIndex);
    expect(appRoutes).not.toMatch(/path:\s*['"]auth(?:\/login)?['"]/);
    expect(appRoutes).not.toMatch(/path:\s*['"]login['"]/);
    expect(appRoutes).not.toMatch(/['"]\.\/pages\/auth/);
    expect(appRoutes).not.toMatch(/SignupCredentialsPage(?:Component)?/);
  });

  it('keeps landing login helpers for signup/onboarding/web while dashboard guards sign in in-app', () => {
    const routeProtection = source('src/app/core/auth/route-protection.ts');
    const guard = source('src/app/core/auth/dashboard-auth.guard.ts');

    expect(routeProtection).toMatch(/buildLandingLoginRedirect/);
    expect(routeProtection).toMatch(/buildDashboardSignInRedirect/);
    expect(routeProtection).toMatch(/CANONICAL_LANDING_ORIGIN\s*=\s*['"]https:\/\/orvel\.pro['"]/);
    expect(routeProtection).not.toMatch(/signInWithPassword|signUp|generateToken|getMockUser/);
    expect(guard).toMatch(/buildDashboardSignInRedirect/);
  });

  it('redirects unauthenticated protected dashboard access to /dashboard/login with sanitized returnTo', () => {
    const routeProtection = source('src/app/core/auth/route-protection.ts');

    expect(routeProtection).toMatch(/LOGIN_ROUTE\s*=\s*['"]\/auth\/login['"]/);
    expect(routeProtection).toMatch(/DASHBOARD_SIGN_IN_ROUTE\s*=\s*['"]\/dashboard\/login['"]/);
    expect(routeProtection).toMatch(/PARAM_BLOCKLIST|access_token|refresh_token|id_token/);
    expect(routeProtection).toMatch(/encodeURIComponent\(safeReturnTo\)/);
    expect(routeProtection).not.toMatch(/LOGIN_ROUTE\s*=\s*['"]\/login['"]/);
  });

  it('fails closed for legacy dashboard local/mock auth paths', () => {
    const authService = source('src/app/services/auth.service.ts');
    const sessionContract = source('src/app/core/auth/session-contract.ts');
    const sessionContractPackage = source('../../packages/auth/src/session-contract.ts');

    expect(authService).not.toMatch(/provider:\s*'mock'|setProvider\(|createMockUser|getMockUser|generateToken|saveSession|loadStoredSession/);
    expect(authService).not.toMatch(/localStorage\.setItem\([^)]*(salon_auth|turnea\.session|token)/i);
    expect(sessionContract).not.toContain('TURNERA_SESSION_KEY');
    // post-chore-extract-auth-package: the canonical source of truth lives at packages/auth/.
    // The dashboard-local shim at apps/dashboard/src/app/core/auth/session-contract.ts
    // is for the migration window and must re-export from @orvel/auth.
    expect(sessionContractPackage).toContain("LEGACY_DASHBOARD_SESSION_STORAGE_KEY");
    expect(sessionContract).toMatch(/from\s+['"]@orvel\/auth['"]/);
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

    expect(supabaseConfig).toMatch(/ORVEL_SUPABASE_AUTH_STORAGE_KEY/);
    expect(source('../../packages/config/src/supabase-storage-key.ts')).toContain('orvel.supabase.auth');
    expect(supabaseAuthClient).toMatch(/storageKey:\s*ORVEL_SUPABASE_AUTH_STORAGE_KEY/);
  });
});
