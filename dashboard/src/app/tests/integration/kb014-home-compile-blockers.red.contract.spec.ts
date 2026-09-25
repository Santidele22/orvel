import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const HOME_TEMPLATE_PATH = join(
  process.cwd(),
  'src/app/pages/dashboard/home/dashboard-home.page.html'
);

const HOME_COMPONENT_PATH = join(
  process.cwd(),
  'src/app/pages/dashboard/home/dashboard-home.page.ts'
);

const DASHBOARD_SERVICE_PATH = join(
  process.cwd(),
  'src/app/core/dashboard/dashboard.service.ts'
);

describe('KB-014 RED guard - Home compile blockers must be fixed explicitly', () => {
  it('forbids template-side Date object creation in dashboard home click handlers (Angular parser)', () => {
    const template = readFileSync(HOME_TEMPLATE_PATH, 'utf8');

    // RED now: template contains `new Date()` inside a click expression.
    expect(template).not.toMatch(/\(click\)="[^"]*new\s+Date\s*\([^)]*\)[^"]*"/);
  });

  it('requires a single revenueChartState declaration in home component', () => {
    const source = readFileSync(HOME_COMPONENT_PATH, 'utf8');
    const matches = source.match(/\brevenueChartState\b\s*=\s*computed\s*\(/g) ?? [];

    // RED now: duplicate declarations with incompatible modifiers/types.
    expect(matches).toHaveLength(1);
  });

  it('requires dashboard service API contract consumed by home component (revenueSeries)', () => {
    const homeSource = readFileSync(HOME_COMPONENT_PATH, 'utf8');
    const serviceSource = readFileSync(DASHBOARD_SERVICE_PATH, 'utf8');

    // RED now: home uses dashboardService.revenueSeries() but service does not expose it.
    if (homeSource.includes('dashboardService.revenueSeries()')) {
      expect(serviceSource).toMatch(/\brevenueSeries\b\s*=\s*computed\s*\(/);
    }
  });

  it('requires a single mapSupabaseRevenueToBars implementation in home component', () => {
    const source = readFileSync(HOME_COMPONENT_PATH, 'utf8');
    const matches = source.match(/^[ \t]*(?:private|protected|public)?[ \t]*mapSupabaseRevenueToBars\s*\(/gm) ?? [];

    // RED now: method is declared twice (public + private).
    expect(matches).toHaveLength(1);
  });
});
