import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';

const CORE_PAGE_CONTAINERS = {
  turnos: 'src/app/features/booking/pages/turnos-list.page.html',
  servicios: 'src/app/pages/dashboard/servicios/servicios.page.html',
  clientes: 'src/app/pages/dashboard/clientes/clientes.page.html',
  configuracion: 'src/app/features/settings/pages/configuracion.page.html'
} as const;

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('UX hardening final: responsive/layout contracts (mock mode, RED)', () => {
  it('requires deterministic responsive hooks in dashboard shell/topbar/sidebar', async () => {
    const [shellHtml, topbarHtml, sidebarHtml] = await Promise.all([
      readFile(fromRoot(SHELL_HTML), 'utf-8'),
      readFile(fromRoot(TOPBAR_HTML), 'utf-8'),
      readFile(fromRoot(SIDEBAR_HTML), 'utf-8')
    ]);

    // TODO(Aurora): agregar hooks estables para layouts mobile/tablet/desktop en shell.
    expect(shellHtml).toMatch(/data-testid=["']dashboard-shell-responsive-root["']/);
    expect(shellHtml).toMatch(/dashboard-shell--mobile/);
    expect(shellHtml).toMatch(/dashboard-shell--tablet/);
    expect(shellHtml).toMatch(/dashboard-shell--desktop/);

    // TODO(Aurora): exponer hook responsive del topbar para colapsado/expandido.
    expect(topbarHtml).toMatch(/data-testid=["']dashboard-topbar-responsive["']/);
    expect(topbarHtml).toMatch(/sm:|md:|lg:/);

    // TODO(Aurora): exponer hook responsive del sidebar para drawer/off-canvas.
    expect(sidebarHtml).toMatch(/data-testid=["']dashboard-sidebar-responsive["']/);
    expect(sidebarHtml).toMatch(/sm:|md:|lg:/);
  });

  it('requires responsive container hooks for core pages', async () => {
    const missing: string[] = [];

    for (const [pageName, relativePath] of Object.entries(CORE_PAGE_CONTAINERS)) {
      const markup = await readFile(fromRoot(relativePath), 'utf-8');
      const expectedHook = `${pageName}-responsive-container`;

      if (!new RegExp(`data-testid=["']${expectedHook}["']`).test(markup)) {
        missing.push(`[${pageName}] Missing deterministic hook \"${expectedHook}\"`);
      }

      if (!/sm:|md:|lg:|xl:/.test(markup)) {
        missing.push(`[${pageName}] Missing explicit breakpoint utility token (sm:/md:/lg:/xl:)`);
      }
    }

    // TODO(Aurora): agregar contenedores responsive estables por página para tests de regresión UX.
    expect(missing, `Responsive contract mismatches:\n${missing.join('\n')}`).toEqual([]);
  });
});
