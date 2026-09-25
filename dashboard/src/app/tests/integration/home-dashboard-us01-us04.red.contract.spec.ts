import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { describe, expect, it } from 'vitest';

const HOME_TS = 'src/app/pages/dashboard/home/dashboard-home.page.ts';
const HOME_HTML = 'src/app/pages/dashboard/home/dashboard-home.page.html';

async function readHomeTs(): Promise<string> {
  return readFile(HOME_TS, 'utf-8');
}

describe('US-01..US-04 Home dashboard RED contracts', () => {
  it('US-01: extracts dashboard home template into external html file', async () => {
    const tsSource = await readHomeTs();

    await expect(access(HOME_HTML, fsConstants.F_OK)).resolves.toBeUndefined();
    expect(tsSource).toMatch(/templateUrl\s*:\s*['"]\.\/dashboard-home\.page\.html['"]/);
    expect(tsSource).not.toMatch(/template\s*:\s*`/);
  });

  it('US-02: keeps open/select/cancel calendar behavior contract in component api', async () => {
    const tsSource = await readHomeTs();

    expect(tsSource).toMatch(/readonly\s+isCalendarOpen\s*=\s*signal\(false\)/);
    expect(tsSource).toMatch(/readonly\s+selectedCalendarDate\s*=\s*signal<Date\s*\|\s*null>\(null\)/);
    expect(tsSource).toMatch(/openCalendar\s*\(\)\s*\{[\s\S]*isCalendarOpen\.set\(true\)/);
    expect(tsSource).toMatch(/onCalendarDateSelected\s*\(date:\s*Date\)\s*\{[\s\S]*selectedCalendarDate\.set\(date\)[\s\S]*isCalendarOpen\.set\(false\)/);
    expect(tsSource).toMatch(/cancelCalendar\s*\(\)\s*\{[\s\S]*isCalendarOpen\.set\(false\)/);
  });

  it('US-03: renders revenue graph through Chart.js Bar contract with mapped dataset', async () => {
    const tsSource = await readHomeTs();

    expect(tsSource).toMatch(/from\s+['"]chart\.js\/auto['"]/);
    expect(tsSource).toMatch(/type\s*:\s*['"]bar['"]/);
    expect(tsSource).toMatch(/labels\s*:\s*this\.revenueChartData\(\)\.map\(/);
    expect(tsSource).toMatch(/data\s*:\s*this\.revenueChartData\(\)\.map\(/);
  });

  it('US-04: defines Supabase mapping contract and empty/error fallback states for chart data', async () => {
    const tsSource = await readHomeTs();

    expect(tsSource).toMatch(/dashboardService\.isLoading\(\)/);
    expect(tsSource).toMatch(/dashboardService\.error\(\)/);
    expect(tsSource).toMatch(/revenueChartState\s*=\s*computed\(/);
    expect(tsSource).toMatch(/status\s*:\s*['"]empty['"]/);
    expect(tsSource).toMatch(/status\s*:\s*['"]error['"]/);
    expect(tsSource).toMatch(/status\s*:\s*['"]ready['"]/);
    expect(tsSource).toMatch(/mapSupabaseRevenueToBars\s*\(/);
  });
});
