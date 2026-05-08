import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const HOME_TS = 'src/app/pages/dashboard/home/dashboard-home.page.ts';
const HOME_HTML = 'src/app/pages/dashboard/home/dashboard-home.page.html';

async function readHomeTs(): Promise<string> {
  return readFile(HOME_TS, 'utf-8');
}

async function readHomeHtml(): Promise<string> {
  return readFile(HOME_HTML, 'utf-8');
}

describe('Home dashboard v2 hotfix/improvements RED contracts', () => {
  it('uses 100% available width for revenue chart container/canvas', async () => {
    const htmlSource = await readHomeHtml();

    expect(htmlSource).toMatch(/class="[^"]*relative[^"]*w-full[^"]*h-\[260px\][^"]*"/);
    expect(htmlSource).toMatch(/<canvas\s+#revenueCanvas[^>]*class="[^"]*w-full[^"]*"/);
  });

  it('restores critical KPI content labels in Home view', async () => {
    const htmlSource = await readHomeHtml();

    expect(htmlSource).toContain('próximo turno');
    expect(htmlSource).toContain('servicio más pedido');
    expect(htmlSource).toContain('turnos del período');
    expect(htmlSource).toContain('ingresos del período');
  });

  it('defines day/week/month summary modes and keeps data/chart update contract consistent', async () => {
    const tsSource = await readHomeTs();
    const htmlSource = await readHomeHtml();

    expect(tsSource).toMatch(/readonly\s+summaryMode\s*=\s*signal<'day'\s*\|\s*'week'\s*\|\s*'month'>\('day'\)/);
    expect(tsSource).toMatch(/setSummaryMode\s*\(mode:\s*'day'\s*\|\s*'week'\s*\|\s*'month'\)\s*\{/);
    expect(tsSource).toMatch(/dashboardService\.(reload|refresh|load|fetch).*(summary|mode|period)/i);
    expect(tsSource).toMatch(/new\s+Chart\([\s\S]*labels\s*:\s*this\.revenueChartData\(\)\.map\(/);

    expect(htmlSource).toMatch(/\(click\)=\"setSummaryMode\('day'\)\"/);
    expect(htmlSource).toMatch(/\(click\)=\"setSummaryMode\('week'\)\"/);
    expect(htmlSource).toMatch(/\(click\)=\"setSummaryMode\('month'\)\"/);
  });
});
