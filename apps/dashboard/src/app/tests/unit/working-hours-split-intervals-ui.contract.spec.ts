import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ZEN_THEME_TEMPLATE = resolve(
  process.cwd(),
  'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html'
);

describe('working hours split intervals UI source contract', () => {
  it('keeps Horarios de atención and exposes Agregar/Quitar corte', () => {
    const source = readFileSync(ZEN_THEME_TEMPLATE, 'utf-8');

    expect(source).toMatch(/data-testid=["']working-hours-section["']/);
    expect(source).toContain('Agregar corte');
    expect(source).toContain('Quitar corte');
  });
});
