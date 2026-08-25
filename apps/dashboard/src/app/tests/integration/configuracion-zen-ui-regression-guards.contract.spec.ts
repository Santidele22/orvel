import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ZEN_THEME_TEMPLATE = resolve(
  process.cwd(),
  'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html'
);

async function readZenThemeTemplate(): Promise<string> {
  return readFile(ZEN_THEME_TEMPLATE, 'utf-8');
}

describe('Configuracion Zen UI regression guards (pre-frontend changes)', () => {
  it('keeps core container and form contracts used by current Configuracion flow', async () => {
    const source = await readZenThemeTemplate();

    expect(source).toMatch(/data-testid=["']configuracion-responsive-container["']/i);
    expect(source).toMatch(/id=["']settings-title["']/i);
    expect(source).toMatch(/<form\s+\[formGroup\]=["']settingsForm["']/i);
    expect(source).toMatch(/aria-label=["']business settings form["']/i);
    expect(source).toMatch(/type=["']submit["'][\s\S]*Guardar cambios/i);
  });

  it('keeps validation error blocks in contextual hierarchy (inside field wrappers)', async () => {
    const source = await readZenThemeTemplate();

    const expectedFieldErrorContracts = [
      {
        field: 'firstName',
        testId: 'config-field-error-firstName'
      },
      {
        field: 'lastName',
        testId: 'config-field-error-lastName'
      },
      {
        field: 'businessName',
        testId: 'config-field-error-businessName'
      }
    ] as const;

    for (const { field, testId } of expectedFieldErrorContracts) {
      const scopedRegex = new RegExp(
        `<div[^>]*class=["'][^"']*space-y-zen-sm[^"']*["'][^>]*>[\\s\\S]*?formControlName=["']${field}["'][\\s\\S]*?@if\\s*\\(fieldErrors\\(\\)\\.${field}\\)[\\s\\S]*?data-testid=["']${testId}["']`,'i'
      );

      expect(source, `${field} error must stay inside its field wrapper block`).toMatch(scopedRegex);
    }
  });

  it('keeps main form section structure for perfil and negocio tabs', async () => {
    const source = await readZenThemeTemplate();

    const perfilStart = source.indexOf("@if (activeSettingsTab() === 'perfil') {");
    const negocioStart = source.indexOf("@if (activeSettingsTab() === 'negocio') {");
    const submitBarStart = source.indexOf("<div [class]=\"ui.cardGlass + ' flex items-center justify-between gap-zen-md'\">");

    const perfilBlock =
      perfilStart >= 0 && negocioStart > perfilStart ? source.slice(perfilStart, negocioStart) : null;
    const negocioBlock =
      negocioStart >= 0 && submitBarStart > negocioStart
        ? source.slice(negocioStart, submitBarStart)
        : null;

    expect(perfilBlock, 'perfil tab block should exist').toBeTruthy();
    expect(negocioBlock, 'negocio tab block should exist').toBeTruthy();

    expect(perfilBlock).toContain('Datos Personales');
    expect(perfilBlock).toContain('Contacto Público');
    expect(perfilBlock).toContain('Cuenta y Suscripción');
    expect(perfilBlock).toContain('Portal de Reservas');
    expect(perfilBlock).toContain('Sucursal activa');
    expect(perfilBlock).toContain('Dar de baja la cuenta');
    expect(perfilBlock).toMatch(/data-testid=["']account-cancellation-open-trigger["']/i);
    expect(perfilBlock).toContain('Cancelamos la renovación de Mercado Pago');

    expect(negocioBlock).toContain('Políticas y Logística');
    expect(negocioBlock).toContain('Horarios de atención');
    expect(negocioBlock).toMatch(/Capacidad|capacity/i);
  });

  it('keeps account cancellation CTA scoped to Cuenta y Suscripción with paid-through copy', async () => {
    const source = await readZenThemeTemplate();
    const accountSectionStart = source.indexOf('Cuenta y Suscripción');
    const portalSectionStart = source.indexOf('Portal de Reservas');
    const accountSection =
      accountSectionStart >= 0 && portalSectionStart > accountSectionStart
        ? source.slice(accountSectionStart, portalSectionStart)
        : '';

    expect(accountSection).toContain('Zona de baja');
    expect(accountSection).toContain('Dar de baja la cuenta');
    expect(accountSection).toContain('Solicitar baja');
    expect(accountSection).toContain('Mercado Pago');
    expect(accountSection).toContain('período ya pago');
    expect(accountSection).toMatch(/\(click\)=["']openAccountCancellationModal\(\)["']/i);
  });
});
