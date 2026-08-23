import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENT_PATH = new URL('./dashboard-home.page.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./dashboard-home.page.html', import.meta.url);

const componentSource = (() => {
  try {
    return fs.readFileSync(COMPONENT_PATH, 'utf8');
  } catch {
    return '';
  }
})();

const templateSource = (() => {
  try {
    return fs.readFileSync(TEMPLATE_PATH, 'utf8');
  } catch {
    return '';
  }
})();

function mobileSummaryBlock(source: string): string {
  const start = source.indexOf('data-testid="dashboard-home-mobile-summary"');
  if (start < 0) {
    return '';
  }

  return source.slice(start);
}

describe('DashboardHomePage mobile gating contract', () => {
  it('imports createIsMobileSignal from ../../../core/shell/is-mobile/is-mobile', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\bcreateIsMobileSignal\b[^}]*\}\s*from\s+['"]\.\.\/\.\.\/\.\.\/core\/shell\/is-mobile\/is-mobile['"]/,
    );
  });

  it('calls createIsMobileSignal() in the component class', () => {
    expect(componentSource).toMatch(/createIsMobileSignal\s*\(/);
  });

  it('exposes isMobile signal accessible from template', () => {
    expect(componentSource).toMatch(/isMobile\s*[=:]/);
  });

  it('template contains @if (!isMobile()) block (desktop path)', () => {
    expect(templateSource).toMatch(/@if\s*\(\s*!isMobile\(\s*\)\s*\)/);
  });

  it('keeps dashboard-home-responsive-root as the page root', () => {
    expect(templateSource).toMatch(
      /<section[^>]*data-testid=["']dashboard-home-responsive-root["']/,
    );
  });

  it('mobile branch exposes dashboard-home-mobile-summary', () => {
    expect(templateSource).toMatch(/data-testid=["']dashboard-home-mobile-summary["']/);
  });

  it('mobile branch shows greeting()', () => {
    expect(mobileSummaryBlock(templateSource)).toMatch(/greeting\(\s*\)/);
  });

  it('mobile branch can share the booking link', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toMatch(/copyBookingUrl|share/i);
  });

  it('mobile branch shows today counts from agendaStatus()', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toMatch(/agendaStatus\(\s*\)\.totalAppointments/);
    expect(mobile).toMatch(/agendaStatus\(\s*\)\.freeSlots/);
  });

  it('mobile branch has one primary CTA to /dashboard/turnos/new', () => {
    const mobile = mobileSummaryBlock(templateSource);
    expect(mobile).toMatch(/\/dashboard\/turnos\/new/);
  });

  it('keeps desktop portal, share header, stats grid, and panels in the file', () => {
    expect(templateSource).toContain('Portal de Reservas');
    expect(templateSource).toContain('Link directo para tus clientes');
    expect(templateSource).toContain('Compartí este link');
    expect(templateSource).toContain('Compartir link');
    expect(templateSource).toMatch(/\(click\)=["']copyBookingUrl\(\)["']/);
    expect(templateSource).toContain('sm:w-auto');
    expect(templateSource).toMatch(
      /class=["'][^"']*grid[^"']*grid-cols-1[^"']*(?:sm:|md:)grid-cols-2[^"']*lg:grid-cols-3[^"']*/,
    );
    expect(templateSource).toMatch(
      /class=["'][^"']*grid[^"']*grid-cols-1[^"']*lg:grid-cols-3[^"']*/,
    );
  });
});
