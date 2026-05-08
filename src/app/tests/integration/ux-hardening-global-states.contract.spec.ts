import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const UI_STATE_COMPONENT_TS =
  'src/app/shared/components/ui-state-message/ui-state-message.component.ts';

const CORE_STATE_CONTRACTS = {
  turnos: {
    file: 'src/app/pages/dashboard/turnos/turnos-list.page.html',
    hooks: ['turnos-loading-state', 'turnos-empty-state', 'turnos-error-state']
  },
  servicios: {
    file: 'src/app/pages/dashboard/servicios/servicios.page.html',
    hooks: ['services-loading-state', 'services-empty-state', 'services-error-state']
  },
  clientes: {
    file: 'src/app/pages/dashboard/clientes/clientes.page.html',
    hooks: ['clients-loading-state', 'clients-empty-state', 'clients-error-state']
  },
  configuracion: {
    file: 'src/app/pages/dashboard/configuracion/configuracion.page.html',
    hooks: ['settings-loading-state', 'settings-empty-state', 'settings-error-state']
  }
} as const;

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

describe('UX hardening final: global states consistency contracts (mock mode, RED)', () => {
  it('requires shared state presentation contract to support loading/empty/error', async () => {
    const source = await readFile(fromRoot(UI_STATE_COMPONENT_TS), 'utf-8');

    // TODO(Aurora): extender shared state component para soportar tone/variant de error.
    expect(source).toMatch(/loading|empty|error/);
    expect(source).toMatch(/@Input\(\).*tone/);
    expect(source).toMatch(/warning|neutral|danger|error/);
  });

  it('requires deterministic loading/empty/error hooks in all core dashboard pages', async () => {
    const mismatches: string[] = [];

    for (const [pageName, contract] of Object.entries(CORE_STATE_CONTRACTS)) {
      const markup = await readFile(fromRoot(contract.file), 'utf-8');

      for (const hook of contract.hooks) {
        if (!new RegExp(`data-testid=["']${hook}["']`).test(markup)) {
          mismatches.push(`[${pageName}] Missing state hook \"${hook}\"`);
        }
      }
    }

    // TODO(Aurora): unificar patrón loading/empty/error en turnos/servicios/clientes/configuración.
    expect(mismatches, `Global state contract mismatches:\n${mismatches.join('\n')}`).toEqual([]);
  });

  it('requires each core page to expose busy/live semantics for async state transitions', async () => {
    const semanticErrors: string[] = [];

    for (const [pageName, contract] of Object.entries(CORE_STATE_CONTRACTS)) {
      const markup = await readFile(fromRoot(contract.file), 'utf-8');

      if (!/aria-busy/.test(markup)) {
        semanticErrors.push(`[${pageName}] Missing aria-busy contract on page container`);
      }

      if (!/aria-live/.test(markup)) {
        semanticErrors.push(`[${pageName}] Missing aria-live feedback contract`);
      }
    }

    // TODO(Aurora): alinear semántica de estado async para accesibilidad consistente.
    expect(
      semanticErrors,
      `State semantics contract mismatches:\n${semanticErrors.join('\n')}`
    ).toEqual([]);
  });
});
