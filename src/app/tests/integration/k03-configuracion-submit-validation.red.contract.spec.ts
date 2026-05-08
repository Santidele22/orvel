import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readConfiguracionSources(): { pageTs: string; themeHtml: string; merged: string } {
  const pageTsPath = resolve(process.cwd(), 'src/app/pages/dashboard/configuracion/configuracion.page.ts');
  const themeHtmlPath = resolve(
    process.cwd(),
    'src/app/pages/dashboard/configuracion/themes/configuracion-zen-theme.component.html'
  );

  const pageTs = existsSync(pageTsPath) ? readFileSync(pageTsPath, 'utf-8') : '';
  const themeHtml = existsSync(themeHtmlPath) ? readFileSync(themeHtmlPath, 'utf-8') : '';

  return {
    pageTs,
    themeHtml,
    merged: `${pageTs}\n${themeHtml}`
  };
}

describe('K03 - Configuración submit validation integration RED contract', () => {
  it('blocks submit via validation contract before persistence side effects', () => {
    const { pageTs } = readConfiguracionSources();

    expect(pageTs).toMatch(/import\s*\{\s*validateConfiguracionForm\s*\}\s*from\s*['"]\.\/configuracion\.validation['"]/);
    expect(pageTs).toMatch(/const\s+validation\s*=\s*validateConfiguracionForm\(.*settingsForm\.getRawValue\(\).*\)/s);
    expect(pageTs).toMatch(/if\s*\(!validation\.isValid\)\s*\{[\s\S]*markAllAsTouched\([\s\S]*return\s*;[\s\S]*\}/);

    const validationIndex = pageTs.indexOf('validateConfiguracionForm(');
    const saveIndex = pageTs.indexOf('saveToSupabase(');
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeLessThan(saveIndex);
  });

  it('exposes field-level errors for UI rendering', () => {
    const { pageTs, themeHtml } = readConfiguracionSources();

    expect(pageTs).toMatch(/fieldErrors\s*=\s*signal<Record<string,\s*string>>\(\{\}\)/);
    expect(pageTs).toMatch(/this\.fieldErrors\.set\(validation\.fieldErrors\)/);
    expect(pageTs).toMatch(/this\.fieldErrors\.set\(\{\}\)/);

    expect(themeHtml).toMatch(/fieldErrors\(\)\./);
    expect(themeHtml).toMatch(/data-testid="config-field-error-/);
  });

  it('keeps deterministic invalid-form UX contract for submit', () => {
    const { merged } = readConfiguracionSources();

    expect(merged).toMatch(/Formulario inválido/i);
    expect(merged).toMatch(/fieldErrors|config-field-error-/i);
    expect(merged).toMatch(/onSubmit\(\)/);
  });
});
