import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readConfiguracionTsSource(): string {
  const tsPath = resolve(
    process.cwd(),
    'src/app/pages/dashboard/configuracion/configuracion.page.ts'
  );

  return existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
}

describe('Sprint 2 RED - Business Settings form contract', () => {
  it('defines typed reactive form controls for settings fields', () => {
    // TODO(Aurora): modelar reactive form tipado para settings (mock mode)
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/nonNullable\.group\(/);
    expect(source).toMatch(/(businessName|nombreNegocio)\s*:/);
    expect(source).toMatch(/(bufferMinutes|minutosBuffer)\s*:/);
    expect(source).toMatch(/(minNoticeMinutes|avisoMinimo)\s*:/);
    expect(source).toMatch(/(slotIntervalMinutes|intervaloTurno)\s*:/);
    expect(source).toMatch(/\bcapacity\b\s*:/);
  });

  it('keeps business capacity configurable with safe minimum validation', () => {
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/\bcapacity\b\s*:\s*\[[^\]]+Validators\.min\(1\)/);
  });

  it('persists positive submit through a mock facade/service contract', () => {
    // TODO(Aurora): implementar submit válido que persista vía facade/service mock (sin Supabase)
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/onSubmit\s*\(/);
    expect(source).toMatch(/(facade|service)/i);
    expect(source).toMatch(/\.(save|update|persist|upsert)\s*\(/i);
  });

  it('blocks invalid numeric values such as negative buffer minutes', () => {
    // TODO(Aurora): impedir valores negativos en campos numéricos y bloquear submit inválido
    const source = readConfiguracionTsSource();

    expect(source).toMatch(/Validators\.min\(0\)|<\s*0/);
    expect(source).toMatch(/(invalid|setErrors|markAllAsTouched)/i);
    expect(source).toMatch(/if\s*\(.*invalid.*\)\s*\{[\s\S]*return;/i);
  });
});
