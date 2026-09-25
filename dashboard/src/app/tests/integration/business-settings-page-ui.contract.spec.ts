import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readConfiguracionPageSource(): string {
  const tsPath = resolve(
    process.cwd(),
    'src/app/features/settings/pages/configuracion.page.ts'
  );
  const htmlPath = resolve(
    process.cwd(),
    'src/app/features/settings/pages/configuracion.page.html'
  );

  const tsSource = existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
  const htmlSource = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';

  return `${tsSource}\n${htmlSource}`;
}

describe('Sprint 2 RED - Business Settings page UI contract', () => {
  it('renders required settings sections for business profile, booking basics and weekly working hours', () => {
    // TODO(Aurora): construir layout base de /dashboard/configuracion con estas 3 secciones mínimas
    const source = readConfiguracionPageSource();

    expect(source).toMatch(/(business profile|perfil del negocio)/i);
    expect(source).toMatch(/formControlName=["']businessName["']|formControlName=["']nombreNegocio["']/i);

    expect(source).toMatch(/(booking basics|configuraci[oó]n base de turnos|reglas de reserva)/i);
    expect(source).toMatch(/formControlName=["']bufferMinutes["']|formControlName=["']minutosBuffer["']/i);
    expect(source).toMatch(/formControlName=["']minNoticeMinutes["']|formControlName=["']avisoMinimo["']/i);
    expect(source).toMatch(/formControlName=["']slotIntervalMinutes["']|formControlName=["']intervaloTurno["']/i);

    expect(source).toMatch(/(working hours|horarios)/i);
    expect(source).toMatch(/(monday|lunes)/i);
    expect(source).toMatch(/(sunday|domingo)/i);
  });

  it('exposes deterministic hooks for loading and empty/default states', () => {
    // TODO(Aurora): exponer estados de carga y estado vacío/default en template con data-testid
    const source = readConfiguracionPageSource();

    expect(source).toMatch(/data-testid=["']settings-loading-state["']/);
    expect(source).toMatch(/data-testid=["']settings-empty-state["']/);
    expect(source).toMatch(/aria-busy/);
  });
});
