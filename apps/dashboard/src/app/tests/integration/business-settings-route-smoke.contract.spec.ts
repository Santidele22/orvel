import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getAppRoutesSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf-8');
}

function getDashboardShellSource(): string {
  return readFileSync(resolve(process.cwd(), 'src/app/dashboard-shell.routes.ts'), 'utf-8');
}

describe('Sprint 2 route-level smoke contract (Business Settings)', () => {
  it('registers /dashboard/configuracion under dashboard children routes', () => {
    const appRoutes = getAppRoutesSource();
    const dashboardShell = getDashboardShellSource();

    expect(appRoutes).toMatch(/path:\s*'dashboard'/);
    expect(dashboardShell).toMatch(/path:\s*'configuracion'/);
  });
});
