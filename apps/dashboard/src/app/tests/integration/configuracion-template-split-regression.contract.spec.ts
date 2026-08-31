import { describe, expect, it } from 'vitest';
import {
  extractConditionalBlock,
  readConfiguracionSources
} from './helpers/configuracion-source';

function assertCoreSettingsContract(source: string, label: string): void {
  expect(source, `${label} should render settings container`).toMatch(
    /data-testid=["']configuracion-responsive-container["']/i
  );
  expect(source, `${label} should include title marker`).toMatch(/id=["']settings-title["']/i);
  expect(source, `${label} should render settings form`).toMatch(
    /<form\s+\[formGroup\]=["']settingsForm["'][\s\S]*\(ngSubmit\)=["']onSubmit\(\)["']/i
  );

  expect(source, `${label} should keep profile binding`).toMatch(/formControlName=["']businessName["']/i);
  expect(source, `${label} should keep booking bindings`).toMatch(/formControlName=["']bufferMinutes["']/i);
  expect(source, `${label} should keep booking bindings`).toMatch(/formControlName=["']minNoticeMinutes["']/i);
  expect(source, `${label} should keep booking bindings`).toMatch(/formControlName=["']slotIntervalMinutes["']/i);
  expect(source, `${label} should keep weekly hours group`).toMatch(/formGroupName=["']workingHours["']/i);
}

describe('Configuracion template split safety net - regression contract', () => {
  it('keeps theme rendering guards in TS while allowing template extraction to separate files', async () => {
    const { tsSource } = await readConfiguracionSources();

    expect(tsSource).toMatch(/get\s+isInk\s*\(\)\s*\{/);
    expect(tsSource).toMatch(/get\s+isIndustrial\s*\(\)\s*\{/);
    expect(tsSource).toMatch(/get\s+isZen\s*\(\)\s*\{/);
    expect(tsSource).toMatch(/get\s+isChic\s*\(\)\s*\{/);
  });

  it('keeps core settings contracts available across configuracion html sources', async () => {
    const { htmlSource } = await readConfiguracionSources();
    assertCoreSettingsContract(htmlSource, 'Configuracion templates');
  });

  it('keeps loading/non-loading rendering guards in configuracion templates', async () => {
    const { htmlSource } = await readConfiguracionSources();

    expect(htmlSource).toMatch(/@if\s*\(loading\(\)\)\s*\{/);
    expect(htmlSource).toMatch(/@if\s*\(!loading\(\)\)\s*\{/);
  });

  it('keeps business switch and template visibility bindings for multi-business flow', async () => {
    const { allSource } = await readConfiguracionSources();

    expect(allSource).toMatch(/hasMultipleBusinesses\s*=\s*computed\(/);
    expect(allSource).toMatch(/\(change\)="onSelectedBusinessChange\(\$any\(\$event\.target\)\.value\)"/);
    expect(allSource).toMatch(/getVisibleTemplates\s*\(/);
    expect(allSource).toMatch(/visibleTemplates\s*=\s*computed\(/);
    expect(allSource).toMatch(/data-testid=["']business-template-selector["']/i);
    expect(allSource).toMatch(/data-testid=["']business-template-option["']/i);
  });

  it('keeps working-hours interaction bindings for time picker start/end actions', async () => {
    const { allSource } = await readConfiguracionSources();

    expect(allSource).toMatch(/openTimePicker\(\$any\(day\.key\),\s*'start'\)/);
    expect(allSource).toMatch(/openTimePicker\(\$any\(day\.key\),\s*'end'\)/);
    expect(allSource).toMatch(/formControlName=["']enabled["']/i);
  });

  it('keeps shared time picker modal flow and key actions intact', async () => {
    const { htmlSource } = await readConfiguracionSources();
    const modalBlock = extractConditionalBlock(htmlSource, 'isTimePickerOpen()') ?? '';

    expect(modalBlock, 'Missing guarded time picker modal block').not.toEqual('');
    expect(modalBlock).toMatch(/\(click\)="closeTimePicker\(\)"/);
    expect(modalBlock).toMatch(/\(click\)="confirmTimeChange\(\)"/);
    expect(modalBlock).toMatch(/selectedAmPm\.set\('AM'\)/);
    expect(modalBlock).toMatch(/selectedAmPm\.set\('PM'\)/);
  });

  it('keeps TypeScript handlers used by current template bindings', async () => {
    const { tsSource } = await readConfiguracionSources();

    expect(tsSource).toMatch(/onSelectedBusinessChange\s*\(businessId:\s*string\)\s*:\s*void/);
    expect(tsSource).toMatch(
      /openTimePicker\s*\(dayKey:\s*WeekdayKey,\s*field:\s*'start'\s*\|\s*'end'\s*\|\s*'start2'\s*\|\s*'end2'\)\s*:\s*void/
    );
    expect(tsSource).toMatch(/confirmTimeChange\s*\(\)\s*:\s*void/);
    expect(tsSource).toMatch(/closeTimePicker\s*\(\)\s*:\s*void/);
    expect(tsSource).toMatch(/settingsForm\.get\(`workingHours\.\$\{day\}\.\$\{field\}`\)\?\.setValue\(formattedTime\)/);
  });
});
