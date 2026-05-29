import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSource(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf-8');
}

function extractStandaloneImports(source: string): string[] {
  const standaloneImportsMatch = source.match(/imports\s*:\s*\[([\s\S]*?)\]/m);
  if (!standaloneImportsMatch) {
    return [];
  }

  return standaloneImportsMatch[1]
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => entry.replace(/\s+/g, ' '));
}

describe('NG8113 targeted warning guard RED contract', () => {
  it('removes unused standalone imports from TurnosListPage', () => {
    // TODO(Magnus): remove NG8113-reported imports from TurnosListPage standalone imports array.
    const source = readSource('src/app/features/booking/pages/turnos-list.page.ts');
    const standaloneImports = extractStandaloneImports(source);

    expect(standaloneImports).not.toContain('RouterLink');
    expect(standaloneImports).not.toContain('StatusBadgeComponent');
  });

  it('removes unused standalone imports from DashboardTopbarComponent', () => {
    // TODO(Magnus): remove NG8113-reported imports from DashboardTopbarComponent standalone imports array.
    const source = readSource('src/app/shared/dashboard-topbar/dashboard-topbar.component.ts');
    const standaloneImports = extractStandaloneImports(source);

    expect(standaloneImports).not.toContain('RouterLink');
  });
});
