import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('KB-002 Contract: Supabase session guards after auth unification', () => {
  it('dashboard protected guards authorize from Supabase getSession only, never legacy storage', () => {
    const routeProtection = source('src/app/core/auth/route-protection.ts');

    expect(routeProtection).toMatch(/createSupabaseAuthClient/);
    expect(routeProtection).toMatch(/getSession\(\)/);
    expect(routeProtection).toMatch(/access_token/);
    expect(routeProtection).not.toMatch(/localStorage\.getItem\([\s\S]{0,280}allowed:\s*true/);
    expect(routeProtection).not.toMatch(/validateSessionSchema\([\s\S]{0,280}allowed:\s*true/);
  });

  it('unauthenticated or errored Supabase guard checks fail closed to canonical landing login', () => {
    const routeProtection = source('src/app/core/auth/route-protection.ts');

    expect(routeProtection).toMatch(/LOGIN_ROUTE\s*=\s*['"]\/auth\/login['"]/);
    expect(routeProtection).toMatch(/buildLandingLoginRedirect\('\/dashboard'\)|buildLandingLoginRedirect\("\/dashboard"\)/);
    expect(routeProtection).toMatch(/return\s*\{\s*allowed:\s*false,\s*redirectTo:\s*buildLandingLoginRedirect\('\/dashboard'\)/);
    expect(routeProtection).not.toMatch(/LOGIN_ROUTE\s*=\s*['"]\/login['"]/);
  });

  it('dashboard routes remain guarded while public booking routes stay public', () => {
    const appRoutes = source('src/app/app.routes.ts');

    expect(appRoutes).toMatch(/path:\s*['"]dashboard['"][\s\S]*canActivate:\s*\[dashboardAuthGuard\]/);
    expect(appRoutes).toMatch(/path:\s*['"]dashboard['"][\s\S]*canActivateChild:\s*\[dashboardAuthChildGuard\]/);
    expect(appRoutes).toMatch(/path:\s*['"]booking\/manage['"][\s\S]*ManageBookingPage/);
    expect(appRoutes).toMatch(/path:\s*['"]booking\/:slug['"][\s\S]*PublicBookingPage/);
  });

  it('canonical auth initiation lives on landing, not a dashboard route/page', () => {
    const appRoutes = source('src/app/app.routes.ts');

    expect(appRoutes).not.toMatch(/path:\s*['"]auth(?:\/login)?['"]/);
    expect(appRoutes).not.toMatch(/path:\s*['"]login['"]/);
    expect(appRoutes).not.toMatch(/['"]\.\/pages\/auth/);
  });
});
