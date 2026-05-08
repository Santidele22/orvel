import { describe, expect, it } from 'vitest';
import { readConfiguracionSources } from './helpers/configuracion-source';

describe('TDD RED integration contract: configuración page business-name + template visibility', () => {
  it('keeps editable business name + save flow contract in zen configuration form', async () => {
    const { allSource, tsSource } = await readConfiguracionSources();

    expect(allSource).toMatch(/formControlName=["']businessName["']/i);
    expect(allSource).toMatch(/\(ngSubmit\)="onSubmit\(\)"/i);
    expect(tsSource).toMatch(/updateBusinessName\s*\(/);
    expect(tsSource).toMatch(/(savedState\(\)\?\.businessName|visibleBusinessName\s*=\s*computed)/i);
  });

  it('renders zen-only theme component and blocks non-zen theme markers', async () => {
    const { allSource } = await readConfiguracionSources();

    expect(allSource).toMatch(/ConfiguracionZenThemeComponent/);
    expect(allSource).toMatch(/app-configuracion-theme-zen/i);
    expect(allSource).not.toMatch(/Configuracion(Industrial|Chic|Ink)ThemeComponent/);
    expect(allSource).not.toMatch(/app-configuracion-theme-(industrial|chic|ink)/i);
  });

  it('preserves business-template visibility normalization + fallback hooks for selected business changes', async () => {
    const { allSource, htmlSource, tsSource } = await readConfiguracionSources();

    expect(tsSource).toMatch(/selectedBusinessId\s*=\s*signal<\s*string\s*\|\s*null\s*>\(/);
    expect(tsSource).toMatch(/onSelectedBusinessChange\s*\(/);
    expect(tsSource).toMatch(/getVisibleTemplates\s*\(/);
    expect(tsSource).toMatch(/visibleTemplates\s*=\s*computed\s*\(/);

    expect(htmlSource).toMatch(/data-layout-section="main_agenda"/i);
    expect(htmlSource).toMatch(/data-layout-section="right_panel"/i);
  });
});
