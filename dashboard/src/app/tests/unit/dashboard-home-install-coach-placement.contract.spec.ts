import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const html = readFileSync(
  join(process.cwd(), 'src/app/features/dashboard-home/pages/dashboard-home.page.html'),
  'utf8'
);

describe('Dashboard home PWA install coach placement', () => {
  it('keeps the install coach off the greeting hero on desktop and mobile', () => {
    expect(html).not.toMatch(
      /greeting\(\)[\s\S]{0,900}data-testid=["']pwa-install-coach["']/
    );
    expect(html).not.toMatch(
      /Tu resumen de hoy\.[\s\S]{0,500}data-testid=["']pwa-install-coach["']/
    );

    const coachHits = html.split('data-testid="pwa-install-coach"').length - 1;
    expect(coachHits).toBeGreaterThanOrEqual(2);
    expect(html).toMatch(/@if\s*\(\s*!isPwaStandalone\(\)\s*\)/);
    expect(html).toContain('routerLink="/dashboard/installar"');
    expect(html).toMatch(/Instalá Orvel en tu teléfono/);
  });
});
