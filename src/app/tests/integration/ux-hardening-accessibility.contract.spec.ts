import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHELL_HTML = 'src/app/shared/dashboard-shell/dashboard-shell.component.html';
const TOPBAR_HTML = 'src/app/shared/dashboard-topbar/dashboard-topbar.component.html';
const SIDEBAR_HTML = 'src/app/shared/dashboard-sidebar/dashboard-sidebar.component.html';
const TURNOS_HTML = 'src/app/pages/dashboard/turnos/turnos-list.page.html';
const SERVICIOS_HTML = 'src/app/pages/dashboard/servicios/servicios.page.html';
const CLIENTES_HTML = 'src/app/pages/dashboard/clientes/clientes.page.html';
const CONFIG_HTML = 'src/app/pages/dashboard/configuracion/configuracion.page.html';
const UI_STATE_COMPONENT_TS =
  'src/app/shared/components/ui-state-message/ui-state-message.component.ts';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('UX hardening final: accessibility contracts (mock mode, RED)', () => {
  it('requires accessible names for key interactive controls in shell/topbar/sidebar', async () => {
    const [shellHtml, topbarHtml, sidebarHtml] = await Promise.all([
      readFile(fromRoot(SHELL_HTML), 'utf-8'),
      readFile(fromRoot(TOPBAR_HTML), 'utf-8'),
      readFile(fromRoot(SIDEBAR_HTML), 'utf-8')
    ]);

    // TODO(Aurora): agregar etiquetas accesibles deterministas a controles globales.
    expect(shellHtml).toMatch(/data-testid=["']dashboard-shell-global-action["']/);
    expect(shellHtml).toMatch(/aria-label=["'][^"']+["']/);

    // TODO(Aurora): migrar icon actions en topbar a botones con nombre accesible.
    expect(topbarHtml).toMatch(/data-testid=["']dashboard-topbar-notifications["']/);
    expect(topbarHtml).toMatch(/aria-label=["']Abrir notificaciones|Open notifications["']/);

    // TODO(Aurora): nombrar selector de unidad/theme para navegación por lector de pantalla.
    expect(sidebarHtml).toMatch(/data-testid=["']dashboard-sidebar-theme-switcher["']/);
    expect(sidebarHtml).toMatch(/\[attr\.aria-label\]=["'][^"']+["']/);
  });

  it('requires aria-live contracts for feedback regions and shared state message', async () => {
    const [turnosHtml, serviciosHtml, clientesHtml, configHtml, stateSource] = await Promise.all([
      readFile(fromRoot(TURNOS_HTML), 'utf-8'),
      readFile(fromRoot(SERVICIOS_HTML), 'utf-8'),
      readFile(fromRoot(CLIENTES_HTML), 'utf-8'),
      readFile(fromRoot(CONFIG_HTML), 'utf-8'),
      readFile(fromRoot(UI_STATE_COMPONENT_TS), 'utf-8')
    ]);

    // TODO(Aurora): app-ui-state-message debe exponer región viva configurable.
    expect(stateSource).toMatch(/aria-live/);
    expect(stateSource).toMatch(/role=\"status\"|role=\"alert\"/);

    // TODO(Aurora): turnos necesita feedback accesible (error/éxito admin actions) con aria-live.
    expect(turnosHtml).toMatch(/aria-live=/);

    // Páginas core restantes ya deben conservar contrato de región viva.
    expect(serviciosHtml).toMatch(/aria-live=/);
    expect(clientesHtml).toMatch(/aria-live=/);
    expect(configHtml).toMatch(/aria-live=/);
  });

  it('requires focus-visible hooks and basic focus management contracts on core forms/actions', async () => {
    const corePages = [
      ['turnos', TURNOS_HTML],
      ['servicios', SERVICIOS_HTML],
      ['clientes', CLIENTES_HTML],
      ['configuracion', CONFIG_HTML]
    ] as const;

    const missingFocusContracts: string[] = [];

    for (const [pageName, relativePath] of corePages) {
      const markup = await readFile(fromRoot(relativePath), 'utf-8');

      if (!/focus-visible:|:focus-visible/.test(markup)) {
        missingFocusContracts.push(
          `[${pageName}] Missing focus-visible class/hook for keyboard navigation contract`
        );
      }

      if (!/data-testid=["'].*(submit|action|primary).*["']/.test(markup)) {
        missingFocusContracts.push(
          `[${pageName}] Missing deterministic primary action hook (data-testid)`
        );
      }
    }

    // TODO(Aurora): estandarizar focus-visible + hooks primarios para navegación por teclado.
    expect(
      missingFocusContracts,
      `Accessibility focus contract mismatches:\n${missingFocusContracts.join('\n')}`
    ).toEqual([]);
  });
});
