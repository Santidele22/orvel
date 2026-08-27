import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

describe('Contract: lighthouse main chunk does not eager-load booking', () => {
  it('does not register provideBooking in app.config.ts', () => {
    const config = source('src/app/app.config.ts');

    expect(config).not.toMatch(/provideBooking/);
    expect(config).not.toMatch(/booking\.providers/);
  });

  it('does not statically import DashboardShellComponent or provideBooking in app.routes.ts', () => {
    const routes = source('src/app/app.routes.ts');

    expect(routes).not.toMatch(/provideBooking/);
    expect(routes).not.toMatch(/DashboardShellComponent/);
  });

  it('uses loadChildren for path empty and path dashboard', () => {
    const routes = source('src/app/app.routes.ts');

    expect(routes).toMatch(/path:\s*'dashboard',\s*\n\s*loadChildren:/);
    expect(routes).toMatch(/path:\s*'',\s*\n\s*loadChildren:/);
  });

  it('registers provideBooking and dashboard auth guards in the lazy dashboard routes module', () => {
    const lazy = source('src/app/dashboard-shell.routes.ts');

    expect(lazy).toMatch(/provideBooking\(\)/);
    expect(lazy).toMatch(/dashboardAuthGuard/);
    expect(lazy).toMatch(/dashboardAuthChildGuard/);
  });

  it('still provides booking on the public booking lazy path', () => {
    const publicRoutes = source('src/app/public-booking.routes.ts');

    expect(publicRoutes).toMatch(/provideBooking\(\)/);
  });
});
