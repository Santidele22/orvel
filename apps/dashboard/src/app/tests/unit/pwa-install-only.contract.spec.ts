import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const routeBlock = (routesSource: string, path: string) => {
  const escapedPath = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return routesSource.match(new RegExp(`\\{\\s*path:\\s*'${escapedPath}',[\\s\\S]*?\\n\\s*\\}`))?.[0] ?? '';
};

describe('Contract: public PWA install-only page', () => {
  it('exposes dashboard/installar as a public top-level route before the guarded dashboard parent', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const installar = routeBlock(appRoutes, 'dashboard/installar');
    const dashboard = routeBlock(appRoutes, 'dashboard');
    const installarIndex = appRoutes.search(/path:\s*'dashboard\/installar'/);
    const dashboardIndex = appRoutes.search(/path:\s*'dashboard'\s*,/);

    expect(installar).toContain('loadComponent');
    expect(installar).not.toContain('canActivate');
    expect(installarIndex).toBeGreaterThan(-1);
    expect(installarIndex).toBeLessThan(dashboardIndex);
    expect(dashboard).toContain('canActivate: [dashboardAuthGuard]');
  });

  it('keeps the install page free of login and dashboard navigation, and defers beforeinstallprompt', () => {
    const appRoutes = source('src/app/app.routes.ts');
    const installar = routeBlock(appRoutes, 'dashboard/installar');
    const importPath = installar.match(/import\('(\.\/[^']+)'\)/)?.[1];

    expect(importPath).toBeTruthy();

    const pagePath = `src/app/${importPath!.replace(/^\.\//, '')}.ts`;
    const page = source(pagePath);

    expect(page).not.toContain('buildLandingLoginRedirect');
    expect(page).not.toContain('dashboardAuthGuard');
    expect(page).not.toMatch(/\/auth\/login/);
    expect(page).not.toMatch(/\/dashboard\/turnos/);
    expect(page).not.toMatch(/\/dashboard\/inicio/);
    expect(page).toContain('beforeinstallprompt');
    expect(page).toContain('prompt(');
  });

  it('keeps the PWA manifest start_url and scope unchanged', () => {
    const manifest = source('src/manifest.webmanifest');

    expect(manifest).toMatch(/"start_url":\s*"\/dashboard\/turnos"/);
    expect(manifest).toMatch(/"scope":\s*"\/dashboard\/"/);
  });
});
