import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ORVEL_SECTION_PRIMITIVES } from '../../shared/dashboard-section-primitives/zen-section-primitives';

const CLIENTES_HTML = 'src/app/features/clientes/pages/clientes.page.html';
const SERVICIOS_HTML = 'src/app/features/servicios/pages/servicios.page.html';
const CONFIGURACION_HTML = 'src/app/features/settings/pages/configuracion.page.html';
const CONFIGURACION_ZEN_HTML =
  'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

function hasToken(value: string, token: string): boolean {
  return new RegExp(`(?:^|\\s)${token}(?:\\s|$)`).test(value);
}

describe('Mobile daily pages pass: shared overflow tokens', () => {
  it('pageRoot and pageViewport clamp horizontal overflow', () => {
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageRoot, 'overflow-x-hidden')).toBe(true);
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageRoot, 'min-w-0')).toBe(true);
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageViewport, 'overflow-x-hidden')).toBe(true);
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageViewport, 'min-w-0')).toBe(true);
  });

  it('pageViewport keeps desktop padding and drops bare mobile p-6', () => {
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageViewport, 'lg:p-10')).toBe(true);
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageViewport, 'p-6')).toBe(false);
    expect(hasToken(ORVEL_SECTION_PRIMITIVES.pageViewport, 'p-4')).toBe(true);
  });
});

describe('Mobile daily pages pass: clientes, servicios, settings', () => {
  it('keeps responsive-container testids and does not add a second nav', async () => {
    const [clientes, servicios, configuracion, configuracionZen] = await Promise.all([
      readFile(fromRoot(CLIENTES_HTML), 'utf-8'),
      readFile(fromRoot(SERVICIOS_HTML), 'utf-8'),
      readFile(fromRoot(CONFIGURACION_HTML), 'utf-8'),
      readFile(fromRoot(CONFIGURACION_ZEN_HTML), 'utf-8')
    ]);

    expect(clientes).toMatch(/data-testid=["']clientes-responsive-container["']/);
    expect(servicios).toMatch(/data-testid=["']servicios-responsive-container["']/);
    expect(`${configuracion}\n${configuracionZen}`).toMatch(
      /data-testid=["']configuracion-responsive-container["']/
    );

    for (const page of [clientes, servicios, configuracion, configuracionZen]) {
      expect(page).not.toContain('app-mobile-bottom-nav');
    }
  });

  it('wraps the clientes phone/email row so long contact text cannot overflow', async () => {
    const clientes = await readFile(fromRoot(CLIENTES_HTML), 'utf-8');
    const phoneIndex = clientes.indexOf('ri-phone-line');
    const emailIndex = clientes.indexOf('ri-mail-line');

    expect(phoneIndex).toBeGreaterThan(-1);
    expect(emailIndex).toBeGreaterThan(phoneIndex);

    const contactWindow = clientes.slice(Math.max(0, phoneIndex - 280), emailIndex + 200);
    expect(contactWindow).toContain('flex-wrap');
    expect(contactWindow).toContain('truncate');
  });
});
