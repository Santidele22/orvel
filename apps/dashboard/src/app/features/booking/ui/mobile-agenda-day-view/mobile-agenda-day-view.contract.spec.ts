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

  // ── PR #3 boundary: NO appointment cards ────────────────────────────────
  it('component does NOT reference MobileAppointmentCardComponent', () => {
    expect(componentSource).not.toMatch(/MobileAppointmentCardComponent/);
  });

  it('component does NOT import any admin action keywords (reschedule/block/cancel)', () => {
    // Check the TS source for admin action patterns that would indicate scope creep
    const adminPattern = /\b(reschedule|blockedTime|cancelTurno|adminReschedule)\b/i;
    expect(componentSource).not.toMatch(adminPattern);
  });
});
