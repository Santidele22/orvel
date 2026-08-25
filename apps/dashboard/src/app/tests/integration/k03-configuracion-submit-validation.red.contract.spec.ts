import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readConfiguracionSources(): { pageTs: string; themeHtml: string; merged: string } {
  const pageTsPath = resolve(process.cwd(), 'src/app/features/settings/pages/configuracion.page.ts');
  const themeHtmlPath = resolve(
    process.cwd(),
    'src/app/features/settings/pages/themes/configuracion-zen-theme.component.html'
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
    const directSaveIndex = pageTs.indexOf('saveToSupabase(');
    const facadeSaveIndex = pageTs.indexOf('facade.save(');
    const saveIndex = directSaveIndex >= 0 ? directSaveIndex : facadeSaveIndex;
    expect(validationIndex).toBeGreaterThanOrEqual(0);
    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(validationIndex).toBeLessThan(saveIndex);
  });

  it('exposes field-level errors for UI rendering', () => {
    const { pageTs, themeHtml } = readConfiguracionSources();
    const expectedFieldErrorTestIds = [
      'config-field-error-phone',
      'config-field-error-supportEmail'
    ];

    expect(pageTs).toMatch(/fieldErrors\s*=\s*signal<Record<string,\s*string>>\(\{\}\)/);
    expect(pageTs).toMatch(/this\.fieldErrors\.set\(validation\.fieldErrors\)/);
    expect(pageTs).toMatch(/this\.fieldErrors\.set\(\{\}\)/);

    expect(themeHtml).toMatch(/fieldErrors\(\)\./);
    expect(themeHtml).toMatch(/data-testid="config-field-error-/);

    for (const testId of expectedFieldErrorTestIds) {
      const fieldName = testId.replace('config-field-error-', '');
      expect(themeHtml, `${fieldName} should render its own field error`).toContain(`fieldErrors().${fieldName}`);
      expect(themeHtml, `${fieldName} should expose a stable field error test id`).toContain(`data-testid="${testId}"`);
    }

    expect(themeHtml, 'logo URL is internal Orvel style state and must not expose a visible field error/test id').not.toContain(
      'config-field-error-logoUrl'
    );
    expect(themeHtml, 'cover URL is internal Orvel style state and must not expose a visible field error/test id').not.toContain(
      'config-field-error-coverUrl'
    );
  });

  it('does not expose Orvel-owned style/business-type settings in the visible UI contract', () => {
    const { themeHtml } = readConfiguracionSources();
    const forbiddenVisibleSettings = [
      { field: 'businessType', label: /Tipo\s+de\s+negocio/i, testId: /business-type|businessType|tipo-negocio/i },
      { field: 'logoUrl', label: /URL\s+del\s+logo|Logo\s+URL/i, testId: /logo-url|logoUrl|config-field-error-logoUrl/i },
      { field: 'coverUrl', label: /URL\s+de\s+portada|Cover\s+URL/i, testId: /cover-url|coverUrl|config-field-error-coverUrl/i }
    ];

    for (const setting of forbiddenVisibleSettings) {
      expect(themeHtml, `${setting.field} may remain internal but must not be an editable visible form control`).not.toMatch(
        new RegExp(`<(?:input|select|textarea)\\b[^>]*formControlName=["']${setting.field}["']`, 'i')
      );
      expect(themeHtml, `${setting.field} must not expose visible settings copy because all accounts follow Orvel style`).not.toMatch(setting.label);
      expect(themeHtml, `${setting.field} must not expose visible deterministic selectors`).not.toMatch(setting.testId);
    }
  });

  it('does not validate hidden Orvel-owned logo and cover URLs during visible settings submit', () => {
    const { pageTs } = readConfiguracionSources();

    expect(pageTs, 'visible settings submit should continue to use the central validation contract').toMatch(
      /validateConfiguracionForm\(.*settingsForm\.getRawValue\(\).*\)/s
    );
    expect(pageTs, 'logo URL must remain hidden/internal and not be patched into visible submit validation errors').not.toMatch(
      /fieldErrors\s*\.\s*set\([\s\S]{0,240}(?:logoUrl|coverUrl)/
    );
  });

  it('keeps deterministic invalid-form UX contract for submit', () => {
    const { merged } = readConfiguracionSources();

    expect(merged).toMatch(/Formulario inválido/i);
    expect(merged).toMatch(/fieldErrors|config-field-error-/i);
    expect(merged).toMatch(/onSubmit\(\)/);
  });
});
