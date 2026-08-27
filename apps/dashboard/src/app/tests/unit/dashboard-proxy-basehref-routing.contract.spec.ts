import '@angular/compiler';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { routes } from '../../app.routes';

const appRoutesSource = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf8');
const shellRoutesPath = resolve(process.cwd(), 'src/app/dashboard-shell.routes.ts');

function findTopLevelRoute(path: string) {
  return routes.find(route => route.path === path);
}

describe('Contract: dashboard routing under /dashboard/ baseHref proxy', () => {
  it('mounts the protected dashboard shell at Angular app root via loadChildren', () => {
    const proxyRootRoute = findTopLevelRoute('');

    expect(typeof proxyRootRoute?.loadChildren).toBe('function');
    expect(proxyRootRoute?.redirectTo).toBeUndefined();
    expect(existsSync(shellRoutesPath)).toBe(true);

    const shellRoutesSource = readFileSync(shellRoutesPath, 'utf8');
    expect(shellRoutesSource).toMatch(/canActivate:\s*\[dashboardAuthGuard\]/);
    expect(shellRoutesSource).toMatch(/canActivateChild:\s*\[dashboardAuthChildGuard\]/);
    expect(shellRoutesSource).toMatch(/path:\s*'',[\s\S]*redirectTo:\s*'inicio'/);
    expect(shellRoutesSource).toMatch(/path:\s*'inicio'/);
  });

  it('preserves the legacy /dashboard/* route shape via loadChildren', () => {
    const legacyDashboardRoute = findTopLevelRoute('dashboard');

    expect(typeof legacyDashboardRoute?.loadChildren).toBe('function');
    expect(existsSync(shellRoutesPath)).toBe(true);

    const shellRoutesSource = readFileSync(shellRoutesPath, 'utf8');
    expect(shellRoutesSource).toMatch(/path:\s*'inicio'/);
  });

  it('does not redirect Angular app root back to dashboard/inicio when baseHref is already /dashboard/', () => {
    expect(appRoutesSource).not.toMatch(/path:\s*'',\s*\n\s*redirectTo:\s*'dashboard\/inicio'/);
  });
});
