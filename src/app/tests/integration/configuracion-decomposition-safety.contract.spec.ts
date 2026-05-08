import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const CONFIGURACION_ROOT = resolve(process.cwd(), 'src/app/pages/dashboard/configuracion');

async function readConfiguracionFile(relativePath: string): Promise<string> {
  return readFile(resolve(CONFIGURACION_ROOT, relativePath), 'utf-8');
}

async function listBasenames(relativeDir: string, extension: '.ts' | '.tpl'): Promise<string[]> {
  const absoluteDir = resolve(CONFIGURACION_ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name.replace(new RegExp(`${extension}$`), ''))
    .sort();
}

async function listComponentTsFiles(relativeDir: string): Promise<string[]> {
  const absoluteDir = resolve(CONFIGURACION_ROOT, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
    .map((entry) => join(absoluteDir, entry.name))
    .sort();
}

describe('Configuracion decomposition safety contracts (composition shell + fragment families)', () => {
  it('keeps configuracion.page.html as a composition shell wiring all theme wrappers and shared modal', async () => {
    const shellSource = await readConfiguracionFile('configuracion.page.html');

    expect(shellSource).toMatch(/<app-configuracion-theme-noir\s+\[ctx\]="viewModel"><\/app-configuracion-theme-noir>/);
    expect(shellSource).toMatch(/<app-configuracion-theme-metal\s+\[ctx\]="viewModel"><\/app-configuracion-theme-metal>/);
    expect(shellSource).toMatch(/<app-configuracion-theme-zen\s+\[ctx\]="viewModel"><\/app-configuracion-theme-zen>/);
    expect(shellSource).toMatch(/<app-configuracion-theme-chic\s+\[ctx\]="viewModel"><\/app-configuracion-theme-chic>/);
    expect(shellSource).toMatch(/<app-configuracion-time-modal\s+\[ctx\]="viewModel"><\/app-configuracion-time-modal>/);
  });

  it('keeps configuracion.page.ts importing and registering shell composition components', async () => {
    const pageSource = await readConfiguracionFile('configuracion.page.ts');

    expect(pageSource).toMatch(/import\s+\{\s*ConfiguracionInkThemeComponent\s*\}\s+from\s+'\.\/themes\/configuracion-ink-theme\.component'/);
    expect(pageSource).toMatch(/import\s+\{\s*ConfiguracionIndustrialThemeComponent\s*\}\s+from\s+'\.\/themes\/configuracion-industrial-theme\.component'/);
    expect(pageSource).toMatch(/import\s+\{\s*ConfiguracionZenThemeComponent\s*\}\s+from\s+'\.\/themes\/configuracion-zen-theme\.component'/);
    expect(pageSource).toMatch(/import\s+\{\s*ConfiguracionChicThemeComponent\s*\}\s+from\s+'\.\/themes\/configuracion-chic-theme\.component'/);
    expect(pageSource).toMatch(/import\s+\{\s*ConfiguracionTimePickerModalComponent\s*\}\s+from\s+'\.\/components\/configuracion-time-picker-modal\.component'/);

    expect(pageSource).toMatch(/imports:\s*\[[\s\S]*ConfiguracionInkThemeComponent[\s\S]*ConfiguracionIndustrialThemeComponent[\s\S]*ConfiguracionZenThemeComponent[\s\S]*ConfiguracionChicThemeComponent[\s\S]*ConfiguracionTimePickerModalComponent[\s\S]*\]/);
  });

  it('keeps industrial and ink theme wrappers composing their fragment-family selectors', async () => {
    const industrialThemeSource = await readConfiguracionFile('themes/configuracion-industrial-theme.component.html');
    const inkThemeSource = await readConfiguracionFile('themes/configuracion-ink-theme.component.html');

    const industrialFragmentSelectors = [
      'app-configuracion-industrial-header',
      'app-configuracion-industrial-loading',
      'app-configuracion-industrial-alerts',
      'app-configuracion-industrial-profile-form',
      'app-configuracion-industrial-booking-settings',
      'app-configuracion-industrial-business-templates',
      'app-configuracion-industrial-working-hours',
      'app-configuracion-industrial-submit-bar'
    ] as const;

    for (const selector of industrialFragmentSelectors) {
      expect(industrialThemeSource).toContain(`<${selector}`);
    }

    const inkFragmentSelectors = [
      'app-configuracion-ink-header',
      'app-configuracion-ink-loading',
      'app-configuracion-ink-alerts',
      'app-configuracion-ink-business-settings-group',
      'app-configuracion-ink-working-hours',
      'app-configuracion-ink-submit-bar'
    ] as const;

    for (const selector of inkFragmentSelectors) {
      expect(inkThemeSource).toContain(`<${selector}`);
    }
  });

  it('keeps the time-picker modal wrapper composing all modal fragment-family selectors', async () => {
    const modalSource = await readConfiguracionFile('components/configuracion-time-picker-modal.component.tpl');

    const modalFragmentSelectors = [
      'app-configuracion-time-picker-header',
      'app-configuracion-time-picker-hour-section',
      'app-configuracion-time-picker-minute-section',
      'app-configuracion-time-picker-ampm-section',
      'app-configuracion-time-picker-confirm-action'
    ] as const;

    for (const selector of modalFragmentSelectors) {
      expect(modalSource).toContain(`<${selector}`);
    }
  });

  it('keeps fragment-family file parity for industrial/ink/modal (.ts + .tpl one-to-one)', async () => {
    const families = ['components/industrial', 'components/ink', 'components/modal'] as const;

    for (const familyDir of families) {
      const tsBasenames = await listBasenames(familyDir, '.ts');
      const tplBasenames = await listBasenames(familyDir, '.tpl');

      expect(tsBasenames, `${familyDir} should include fragment TS files`).not.toEqual([]);
      expect(tplBasenames, `${familyDir} should include fragment template files`).not.toEqual([]);
      expect(tsBasenames, `${familyDir} must preserve TS/TPL parity after decomposition`).toEqual(
        tplBasenames
      );
    }
  });

  it('keeps fragment-family components standalone with selector + .tpl template contracts', async () => {
    const families = ['components/industrial', 'components/ink', 'components/modal'] as const;

    for (const familyDir of families) {
      const tsFiles = await listComponentTsFiles(familyDir);

      for (const tsFile of tsFiles) {
        const source = await readFile(tsFile, 'utf-8');
        const filename = tsFile.split('/').pop() ?? tsFile;
        const basename = filename.replace(/\.ts$/, '');

        expect(source, `${filename} should stay standalone`).toMatch(/standalone:\s*true/);
        expect(source, `${filename} should declare configuracion selector`).toMatch(
          /selector:\s*'app-configuracion-[a-z0-9-]+'/i
        );
        expect(source, `${filename} should keep templateUrl contract to matching .tpl`).toMatch(
          new RegExp(`templateUrl:\\s*'\\./${basename}\\.tpl'`)
        );
      }
    }
  });
});
