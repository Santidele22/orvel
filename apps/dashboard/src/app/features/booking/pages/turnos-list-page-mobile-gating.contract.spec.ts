import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENT_PATH = new URL('./turnos-list.page.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./turnos-list.page.html', import.meta.url);

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

describe('TurnosListPage mobile gating contract', () => {
  // ── Imports isMobile signal helper ──────────────────────────────
  it('imports createIsMobileSignal from the new helper', () => {
    expect(componentSource).toMatch(/createIsMobileSignal/);
  });

  it('imports createIsMobileSignal from ../../core/shell/is-mobile/is-mobile', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\bcreateIsMobileSignal\b[^}]*\}\s*from\s+['"]\.\.\/\.\.\/\.\.\/core\/shell\/is-mobile\/is-mobile['"]/,
    );
  });

  // ── Signal usage in component ───────────────────────────────────
  it('calls createIsMobileSignal() in the component class', () => {
    expect(componentSource).toMatch(/createIsMobileSignal\s*\(/);
  });

  it('exposes isMobile signal accessible from template', () => {
    // Should be a class property
    expect(componentSource).toMatch(/isMobile\s*[=:]/);
  });

  // ── Mobile block in template ────────────────────────────────────
  it('template contains @if (!isMobile()) block (desktop path)', () => {
    expect(templateSource).toMatch(/@if\s*\(\s*!isMobile\(\s*\)\s*\)/);
  });

  it('template renders app-mobile-agenda-day-view inside the mobile @else block', () => {
    // The else branch should contain the day view component
    expect(templateSource).toMatch(/app-mobile-agenda-day-view/);
  });

  // ── Desktop branch selector gating ──────────────────────────────
  it('branch selector is gated by !isMobile()', () => {
    // The section with the branch selector (active-branch-selector) should be
    // inside !isMobile() block
    expect(templateSource).toMatch(/!isMobile\(\s*\)/);
  });

  // ── Desktop layout exclusivity ──────────────────────────────────
  it('app-calendar-picker appears before app-mobile-agenda-day-view (desktop gated)', () => {
    // calendar-picker is in the desktop branch, mobile-agenda-day-view in the else branch.
    // Verify the source ordering: calendar-picker comes first, then the mobile view.
    const cpIndex = templateSource.indexOf('app-calendar-picker');
    const mvIndex = templateSource.indexOf('app-mobile-agenda-day-view');
    expect(cpIndex).toBeGreaterThanOrEqual(0);
    expect(mvIndex).toBeGreaterThanOrEqual(0);
    // calendar-picker must be rendered BEFORE the mobile day view in source order
    expect(cpIndex).toBeLessThan(mvIndex);
  });

  // ── Template has @if (!isMobile()) { ... } @else { ... } conditional ──
  it('template has !isMobile() conditional branching', () => {
    const hasIfElse = templateSource.match(
      /@if\s*\(\s*!isMobile\(/,
    );
    expect(hasIfElse).not.toBeNull();
  });

  // ── PR #4 fixup: mobileAppointments signal (Issue 3) ────────────
  it('page declares mobileAppointments as a computed signal', () => {
    // computed may have a type parameter like computed<TurnoWithRelations[]>(
    expect(componentSource).toMatch(/mobileAppointments\s*=\s*computed\b/);
  });

  it('mobileAppointments does NOT call slice (no limit gating)', () => {
    // mobileAppointments must exist; within 300 chars of its name, no .slice(
    expect(componentSource).toMatch(/mobileAppointments/);
    expect(componentSource).not.toMatch(/mobileAppointments[\s\S]{0,300}\.slice\(/);
  });

  it('template app-mobile-agenda-day-view includes (selectedDateChange) output binding', () => {
    // The line with app-mobile-agenda-day-view should have (selectedDateChange)
    const viewMatch = templateSource.match(/<app-mobile-agenda-day-view[^>]*>/);
    expect(viewMatch).not.toBeNull();
    const viewLine = viewMatch![0];
    expect(viewLine).toMatch(/\(selectedDateChange\)/);
  });
});
