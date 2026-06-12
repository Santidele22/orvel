import '@angular/compiler';
import { Route } from '@angular/router';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { dashboardShellChildren, routes } from '../../app.routes';
import { dashboardAuthChildGuard, dashboardAuthGuard } from '../../core/auth/dashboard-auth.guard';
import { DashboardShellComponent } from '../../shared/dashboard-shell/dashboard-shell.component';

const routesSource = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf8');

function findTopLevelRoute(path: string): Route | undefined {
  return routes.find(route => route.path === path);
}

describe('Contract: dashboard routing under /dashboard/ baseHref proxy', () => {
  it('mounts the protected dashboard shell at Angular app root for /dashboard/ baseHref', () => {
    const proxyRootRoute = findTopLevelRoute('');

    expect(proxyRootRoute?.component).toBe(DashboardShellComponent);
    expect(proxyRootRoute?.canActivate).toEqual([dashboardAuthGuard]);
    expect(proxyRootRoute?.canActivateChild).toEqual([dashboardAuthChildGuard]);
    expect(proxyRootRoute?.children).toBe(dashboardShellChildren);
    expect(proxyRootRoute?.children?.[0]).toMatchObject({ path: '', redirectTo: 'inicio', pathMatch: 'full' });
    expect(proxyRootRoute?.children?.some(child => child.path === 'inicio')).toBe(true);
  });

  it('preserves the legacy /dashboard/* route shape for non-proxied dashboard entry points', () => {
    const legacyDashboardRoute = findTopLevelRoute('dashboard');

    expect(legacyDashboardRoute?.component).toBe(DashboardShellComponent);
    expect(legacyDashboardRoute?.canActivate).toEqual([dashboardAuthGuard]);
    expect(legacyDashboardRoute?.canActivateChild).toEqual([dashboardAuthChildGuard]);
    expect(legacyDashboardRoute?.children).toBe(dashboardShellChildren);
    expect(legacyDashboardRoute?.children?.some(child => child.path === 'inicio')).toBe(true);
  });

  it('does not redirect Angular app root back to dashboard/inicio when baseHref is already /dashboard/', () => {
    expect(routesSource).not.toMatch(/path:\s*'',\s*\n\s*redirectTo:\s*'dashboard\/inicio'/);
  });
});
