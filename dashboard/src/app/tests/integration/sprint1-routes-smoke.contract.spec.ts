import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function getRoutesSource(): string {
  const appRoutes = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf-8');
  const dashboardShell = readFileSync(
    resolve(process.cwd(), 'src/app/dashboard-shell.routes.ts'),
    'utf-8',
  );
  return `${appRoutes}\n${dashboardShell}`;
}

describe('Sprint 1 route-level smoke contract', () => {
  it('registers /dashboard/servicios route', () => {
    const routesSource = getRoutesSource();
    expect(routesSource).toMatch(/path:\s*'servicios'/);
  });

  it('registers /dashboard/clientes route', () => {
    const routesSource = getRoutesSource();
    expect(routesSource).toMatch(/path:\s*'clientes'/);
  });
});
