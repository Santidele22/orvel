import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function fromRoot(relativePath: string): string {
  return join(process.cwd(), relativePath);
}

const STEP_HTML = 'src/app/pages/landing/onboarding-business-step.page.html';
const STEP_TS = 'src/app/pages/landing/onboarding-business-step.page.ts';

describe('Contract: landing onboarding business-step UI', () => {
  it('renders the onboarding copy exactly as requested', async () => {
    const html = await readFile(fromRoot(STEP_HTML), 'utf-8');
    const source = await readFile(fromRoot(STEP_TS), 'utf-8');

    expect(html).toContain('¿Qué servicios ofrece tu negocio?');
    expect(html).toContain('Seleccioná todos los que apliquen.');
    expect(source).toContain('Peluquería');
    expect(source).toContain('Uñas');
    expect(source).toContain('Barbería');
    expect(source).toContain('Pestañas');
    expect(source).toContain('Spa');
    expect(html).toContain('Podés editar todo después.');
    expect(html).toContain(
      'La plantilla solo precarga una configuración inicial. No cambia el funcionamiento de tu cuenta.'
    );
    expect(html).toContain('Continuar');
  });

  it('uses true checkbox semantics and disables CTA until there is at least one selection', async () => {
    const html = await readFile(fromRoot(STEP_HTML), 'utf-8');

    expect(html).toMatch(/type="checkbox"/);
    expect(html).toMatch(/\[disabled\]="!canContinue\(\)"/);
  });

  it('sends selectedRubros and selectedBusinessTypes through mock login session payload on continue', async () => {
    const source = await readFile(fromRoot(STEP_TS), 'utf-8');

    expect(source).toMatch(/createMockSessionFromLogin/);
    expect(source).toMatch(/localStorage\.setItem\(/);
    expect(source).toMatch(/selectedRubros/);
    expect(source).toMatch(/selectedBusinessTypes/);
    expect(source).toMatch(/TURNERA_SESSION_KEY/);
  });

  it('continue handler persists selectedTemplateIds safely in TURNERA_SESSION_KEY payload', async () => {
    const source = await readFile(fromRoot(STEP_TS), 'utf-8');

    expect(source).toMatch(/selectedTemplateIds/);
    expect(source).toMatch(/sanitizeSelectedTemplateIds/);
    expect(source).toMatch(/TURNERA_SESSION_KEY/);
    expect(source).toMatch(/JSON\.stringify\(/);
  });
});
