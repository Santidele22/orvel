import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';
const TURNOS_HTML = 'src/app/features/booking/pages/turnos-list.page.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function parseHtml(html: string): Document {
  return new JSDOM(`<body>${html}</body>`).window.document;
}

describe('Dashboard contract: admin flow and functional structure', () => {
  it('keeps shell main composition order stable', async () => {
    const shellHtml = await readFile(fromRoot(SHELL_HTML), 'utf-8');

    expect(shellHtml.indexOf('<app-dashboard-sidebar')).toBeLessThan(shellHtml.indexOf('<app-dashboard-topbar'));
    expect(shellHtml.indexOf('<app-dashboard-topbar')).toBeLessThan(shellHtml.indexOf('<router-outlet'));
    expect(shellHtml).toContain('data-testid="dashboard-shell-global-action"');
  });

  it('keeps admin sidebar navigation routes for supervision sections', async () => {
    const sidebarHtml = await readFile(fromRoot(SIDEBAR_HTML), 'utf-8');

    const requiredRoutes = [
      '/dashboard/turnos',
      '/dashboard/clientes',
      '/dashboard/servicios',
      '/dashboard/configuracion'
    ];

    for (const route of requiredRoutes) {
      expect(sidebarHtml).toContain(`routerLink="${route}"`);
    }
  });

  it('keeps deterministic turnos admin actions and timeline slots in template', async () => {
    const turnosHtml = await readFile(fromRoot(TURNOS_HTML), 'utf-8');
    const turnosDoc = parseHtml(turnosHtml);

    const cancelActions = Array.from(
      turnosDoc.querySelectorAll('[data-testid="turno-admin-cancel-action"]')
    );
    const rescheduleActions = Array.from(
      turnosDoc.querySelectorAll('[data-testid="turno-admin-reschedule-action"]')
    );

    expect(cancelActions.length).toBeGreaterThan(0);
    expect(rescheduleActions.length).toBeGreaterThan(0);

    for (const hour of ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00']) {
      expect(turnosHtml).toContain(hour);
    }
  });
});
