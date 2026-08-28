import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routeBlock = (routesSource: string, path: string) => {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return routesSource.match(new RegExp(`\\{\\s*path:\\s*'${escapedPath}',[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '';
};

describe('Contract: public PWA in-app sign-in', () => {
  it('exposes dashboard/login as a public top-level route before the guarded dashboard parent', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const dashboardShell = source('src/app/dashboard-shell.routes.ts');
    const signIn = routeBlock(appRoutes, 'dashboard/login');
    const signInIndex = appRoutes.search(/path:\s*'dashboard\/login'/);
    const dashboardIndex = appRoutes.search(/path:\s*'dashboard'\s*,/);

    expect(signIn).toContain('loadComponent');
    expect(signIn).toContain('OperatorSignInPage');
    expect(signIn).not.toContain('canActivate');
    expect(signInIndex).toBeGreaterThan(-1);
    expect(signInIndex).toBeLessThan(dashboardIndex);
    expect(dashboardShell).toContain('canActivate: [dashboardAuthGuard]');
  });

  it('signs in through AuthService.login and offers Crear cuenta without mounting the dashboard guard', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const signIn = routeBlock(appRoutes, 'dashboard/login');
    const importPath = signIn.match(/import\('(\.\/[^']+)'\)/)?.[1];

    expect(importPath).toBeTruthy();

    const pagePath = `src/app/${importPath!.replace(/^\.\//, '')}.ts`;
    const page = source(pagePath);
    const authService = source('src/app/services/auth.service.ts');

    expect(page).toContain('AuthService');
    expect(page).toMatch(/\.login\(/);
    expect(page).toContain('Crear cuenta');
    expect(page).not.toContain('dashboardAuthGuard');
    expect(authService).toContain('signInWithPassword');
  });

  it('keeps the PWA manifest start_url and scope unchanged', () => {
    const manifest = source('src/manifest.webmanifest');

    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });
});
