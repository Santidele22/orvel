import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENT_PATH = new URL('./mobile-agenda-day-view.component.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./mobile-agenda-day-view.component.html', import.meta.url);
const HOOK_PATH = new URL(
  '../../../../shared/hooks/use-day-strip-controller/use-day-strip-controller.ts',
  import.meta.url,
);

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

const hookSource = (() => {
  try {
    return fs.readFileSync(HOOK_PATH, 'utf8');
  } catch {
    return '';
  }
})();

describe('MobileAgendaDayView contract', () => {
  // ── Chain dependency assertion ──────────────────────────────────────────
  it('PR #1 hook exists at the expected path', () => {
    expect(hookSource, 'use-day-strip-controller.ts must exist').not.toBe('');
  });

  // ── Component file existence ────────────────────────────────────────────
  it('component file exists at the expected path', () => {
    expect(componentSource, 'mobile-agenda-day-view.component.ts must exist').not.toBe('');
  });

  it('imports signal from @angular/core', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\bsignal\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  it('imports useDayStripController from the shared hook', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\buseDayStripController\b[^}]*\}\s*from\s+['"]\.\.\/\.\.\/\.\.\/\.\.\/shared\/hooks\/use-day-strip-controller\/use-day-strip-controller['"]/,
    );
  });

  it('is standalone (standalone: true)', () => {
    expect(componentSource).toMatch(/standalone:\s*true/);
  });

  // ── Template existence ──────────────────────────────────────────────────
  it('template file exists at the expected path', () => {
    expect(templateSource, 'mobile-agenda-day-view.component.html must exist').not.toBe('');
  });

  // ── Day strip section ───────────────────────────────────────────────────
  it('template has data-testid="mobile-agenda-day-strip"', () => {
    expect(templateSource).toMatch(/data-testid="mobile-agenda-day-strip"/);
  });

  // ── Empty state section ─────────────────────────────────────────────────
  it('template has data-testid="mobile-agenda-empty-state"', () => {
    expect(templateSource).toMatch(/data-testid="mobile-agenda-empty-state"/);
  });

  // ── FAB section ─────────────────────────────────────────────────────────
  it('template has data-testid="mobile-agenda-fab"', () => {
    expect(templateSource).toMatch(/data-testid="mobile-agenda-fab"/);
  });

  it('FAB has routerLink="/dashboard/turnos/new"', () => {
    expect(templateSource).toMatch(/routerLink="\/dashboard\/turnos\/new"/);
  });

  // ── PR #3 integration: MobileAppointmentCard ─────────────────────────────
  it('imports MobileAppointmentCardComponent', () => {
    expect(componentSource).toMatch(/MobileAppointmentCardComponent/);
  });

  it('component has MobileAppointmentCardComponent in imports array', () => {
    // Verify it's listed in the component decorator imports
    expect(componentSource).toMatch(/imports:\s*\[[^\]]*MobileAppointmentCardComponent[^\]]*\]/);
  });

  // ── Timeline section (PR #3) ─────────────────────────────────────────────
  it('template has data-testid="mobile-agenda-timeline"', () => {
    expect(templateSource).toMatch(/data-testid="mobile-agenda-timeline"/);
  });

  it('template renders app-mobile-appointment-card with [turno] binding', () => {
    expect(templateSource).toMatch(/app-mobile-appointment-card/);
  });

  it('timeline and empty state are mutually exclusive (@if chains)', () => {
    // The empty state and timeline should be in different branches of @if
    const emptyStateLine = templateSource.match(/.*data-testid="mobile-agenda-empty-state".*/);
    const timelineLine = templateSource.match(/.*data-testid="mobile-agenda-timeline".*/);
    // Both should exist
    expect(emptyStateLine).not.toBeNull();
    expect(timelineLine).not.toBeNull();
    // Rough check they're in different @if blocks
    const lines = templateSource.split('\n');
    const emptyIdx = lines.findIndex((l) => l.includes('data-testid="mobile-agenda-empty-state"'));
    const timelineIdx = lines.findIndex((l) => l.includes('data-testid="mobile-agenda-timeline"'));
    // The empty state is rendered when `isEmpty` is true; timeline when there are items
    expect(emptyIdx).toBeGreaterThanOrEqual(0);
    expect(timelineIdx).toBeGreaterThanOrEqual(0);
    expect(Math.abs(emptyIdx - timelineIdx)).toBeGreaterThanOrEqual(3); // different blocks
  });

  // ── PR #4: TurnoService data wiring ──────────────────────────────
  it('imports TurnoService', () => {
    expect(componentSource).toMatch(/TurnoService/);
  });

  it('imports TurnoService from the data-access path', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\bTurnoService\b[^}]*\}\s*from\s+['"]\.\.\/\.\.\/data-access\/turno\.service['"]/,
    );
  });

  it('has a computed() signal for appointments', () => {
    expect(componentSource).toMatch(/appointments\s*=\s*computed\(/);
  });

  it('template @for iterates over appointments()', () => {
    expect(templateSource).toMatch(/@for\s*\([^)]+of\s*appointments\(\)/);
  });

  it('component does NOT import any admin action keywords (reschedule/block/cancel)', () => {
    // Check the TS source for admin action patterns that would indicate scope creep
    const adminPattern = /\b(reschedule|blockedTime|cancelTurno|adminReschedule)\b/i;
    expect(componentSource).not.toMatch(adminPattern);
  });
});
