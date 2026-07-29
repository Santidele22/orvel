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

  // ── PR #4 fixup: single-source data wiring (Issue 3) ──────────────
  it('component does NOT import TurnoService (no inject)', () => {
    expect(componentSource).not.toMatch(/\binject\(\s*TurnoService\s*\)/);
  });

  it('component does NOT import TurnoService from data-access path', () => {
    expect(componentSource).not.toMatch(/import\s*\{[^}]*\bTurnoService\b[^}]*\}\s*from\s+['"]\.\.\/\.\.\/data-access\/turno\.service['"]/);
  });

  it('component has @Output() selectedDateChange', () => {
    expect(componentSource).toMatch(/@Output\(\)\s*selectedDateChange/);
  });

  it('component imports EventEmitter<Date>', () => {
    expect(componentSource).toMatch(/EventEmitter<Date>/);
  });

  it('component does NOT import computed (no computed needed)', () => {
    expect(componentSource).not.toMatch(/\bcomputed\b/);
  });

  // ── PR #4 fixup: dynamic empty state title (Issue 1) ─────────────
  it('template uses isToday(_selectedDate()) for dynamic empty state title', () => {
    expect(templateSource).toMatch(/isToday\(\s*_selectedDate\(\s*\)\s*\)/);
  });

  // ── PR #4 fixup: disabled CTAs with próximamente hint (Issue 2) ──
  it('template has data-testid="mobile-agenda-pending-cta-hint"', () => {
    expect(templateSource).toMatch(/data-testid="mobile-agenda-pending-cta-hint"/);
  });

  it('walk-in button has disabled attribute', () => {
    // disabled and button text may be on different lines — search in proximity
    expect(templateSource).toMatch(/disabled[\s\S]{0,200}Agregar walk-in/);
  });

  it('compartir button has disabled attribute', () => {
    expect(templateSource).toMatch(/disabled[\s\S]{0,200}Compartir tu página/);
  });

  // ── PR #4 fixup: @for over turnos (not appointments()) ───────────
  it('template @for iterates over turnos (not appointments())', () => {
    expect(templateSource).toMatch(/@for\s*\([^)]*of\s+turnos[^a-zA-Z]/);
  });

  it('component does NOT import any admin action keywords (reschedule/block/cancel)', () => {
    // Check the TS source for admin action patterns that would indicate scope creep
    const adminPattern = /\b(reschedule|blockedTime|cancelTurno|adminReschedule)\b/i;
    expect(componentSource).not.toMatch(adminPattern);
  });

  // ── PR #2: Card tap → route navigation ────────────────────────────
  it('template wires (cardTapped) to onCardTapped($event)', () => {
    expect(templateSource).toMatch(/\(cardTapped\)="onCardTapped\(\$event\)"/);
  });

  it('has onCardTapped method in component TS', () => {
    expect(componentSource).toMatch(/onCardTapped\(/);
  });

  it('onCardTapped calls router.navigate with path and state', () => {
    expect(componentSource).toMatch(
      /router\.navigate\(.+dashboard\/turnos.+state.+turno/,
    );
  });

  it('imports Router from @angular/router', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\bRouter\b[^}]*\}\s*from\s+['"]@angular\/router['"]/,
    );
  });

  it('imports inject from @angular/core for Router', () => {
    // The day view uses inject() for Router — verify it's imported or available
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\binject\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  it('component does NOT use [routerLink] on mobile-appointment-card (navigation via event)', () => {
    // Card navigation must be via (cardTapped) event, not [routerLink]
    expect(templateSource).not.toMatch(/\[routerLink\].*mobile-appointment-card/);
  });
});
