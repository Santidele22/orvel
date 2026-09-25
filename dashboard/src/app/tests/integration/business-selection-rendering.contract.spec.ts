import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIDEBAR_TS = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.ts';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('Business switcher conditional contract (Sprint 1 v2)', () => {
  it('renders business switcher only when user has more than one business', async () => {
    // TODO(Aurora): encapsular visibilidad del switcher en condición determinista (>1 negocios).
    const sidebarHtml = await readFile(fromRoot(SIDEBAR_HTML), 'utf-8');

    expect(sidebarHtml).toMatch(/@if\s*\(\s*dashboards\s*\.?length\s*>\s*1\s*\)/i);
    expect(sidebarHtml).toMatch(/data-testid=["']dashboard-sidebar-theme-switcher["']/i);
  });

  it('keeps switcher hidden for one business or empty business list', async () => {
    // TODO(Aurora): añadir helper explícito (ej: showBusinessSwitcher) y usarlo en template.
    const sidebarTs = await readFile(fromRoot(SIDEBAR_TS), 'utf-8');

    expect(sidebarTs).toMatch(/showBusinessSwitcher|hasMultipleBusinesses|shouldShowBusinessSwitcher/);
    expect(sidebarTs).toMatch(/dashboards\s*\.?length\s*>\s*1/);
  });
});
