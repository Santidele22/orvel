import { existsSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routeBlock = (routesSource: string, path: string) => {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return routesSource.match(new RegExp(`\\{\\s*path:\\s*'${escapedPath}',[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '';
};

describe('Contract: public PWA in-app sign-in', () => {
  it('hops dashboard/login to in-app auth/login before the guarded dashboard parent', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const dashboardShell = source('src/app/dashboard-shell.routes.ts');
    const signIn = routeBlock(appRoutes, 'dashboard/login');
    const signInIndex = appRoutes.search(/path:\s*'dashboard\/login'/);
    const dashboardIndex = appRoutes.search(/path:\s*'dashboard'\s*,/);

    expect(signIn).toContain("redirectTo: '/auth/login'");
    expect(signIn).toContain("pathMatch: 'full'");
    expect(signIn).not.toContain('canActivate');
    expect(signIn).not.toContain('OperatorSignInPage');
    expect(signIn).not.toContain('loadComponent');
    expect(signInIndex).toBeGreaterThan(-1);
    expect(signInIndex).toBeLessThan(dashboardIndex);
    expect(dashboardShell).toContain('canActivate: [dashboardAuthGuard]');
  });

  it('does not keep the duplicate operator sign-in page; in-app login owns the form', () => {
    expect(existsSync(resolve(process.cwd(), 'src/app/features/pwa-install/pages/operator-sign-in.page.ts'))).toBe(false);
    expect(existsSync(resolve(process.cwd(), 'src/app/features/auth/pages/in-app-login.page.ts'))).toBe(true);

    const loginPage = source('src/app/features/auth/pages/in-app-login.page.ts');
    const authService = source('src/app/services/auth.service.ts');

    expect(loginPage).toContain('AuthService');
    expect(loginPage).toMatch(/\.login\(/);
    expect(authService).toContain('signInWithPassword');
  });

  it('keeps the PWA manifest start_url and scope unchanged', () => {
    const manifest = source('src/manifest.webmanifest');

    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });
});
