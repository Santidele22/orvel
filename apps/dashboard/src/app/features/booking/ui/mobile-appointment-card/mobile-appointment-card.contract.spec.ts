import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENT_PATH = new URL('./mobile-appointment-card.component.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./mobile-appointment-card.component.html', import.meta.url);
const DAY_VIEW_PATH = new URL(
  '../mobile-agenda-day-view/mobile-agenda-day-view.component.ts',
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

const dayViewSource = (() => {
  try {
    return fs.readFileSync(DAY_VIEW_PATH, 'utf8');
  } catch {
    return '';
  }
})();

describe('MobileAppointmentCard contract', () => {
  // ── Chain dependency: PR #2 must exist ──────────────────────────
  it('PR #2 day-view component exists at the expected path', () => {
    expect(dayViewSource, 'mobile-agenda-day-view.component.ts must exist').not.toBe('');
  });

  // ── Component file existence ────────────────────────────────────
  it('component file exists at the expected path', () => {
    expect(componentSource, 'mobile-appointment-card.component.ts must exist').not.toBe('');
  });

  it('imports Component from @angular/core', () => {
    expect(componentSource).toMatch(
      /import\s*\{[^}]*\bComponent\b[^}]*\}\s*from\s+['"]@angular\/core['"]/,
    );
  });

  it('has an @Input or input() named turno typed to TurnoWithRelations', () => {
    // Match either decorator @Input() turno or signal input()<TurnoWithRelations>
    expect(componentSource).toMatch(
      /(?:@Input\(\)\s+turno|input\s*[<(]\s*TurnoWithRelations|turno\s*[=:]\s*input)/,
    );
  });

  it('is standalone (standalone: true)', () => {
    expect(componentSource).toMatch(/standalone:\s*true/);
  });

  // ── Template existence ──────────────────────────────────────────
  it('template file exists at the expected path', () => {
    expect(templateSource, 'mobile-appointment-card.component.html must exist').not.toBe('');
  });

  it('template has data-testid="mobile-appointment-card"', () => {
    expect(templateSource).toMatch(/data-testid="mobile-appointment-card"/);
  });

  it('template renders time with tabular-nums', () => {
    expect(templateSource).toMatch(/tabular-nums/);
  });

  it('template renders service name (servicioNombre)', () => {
    expect(templateSource).toMatch(/servicioNombre/);
  });

  it('template renders client name (clienteNombre)', () => {
    expect(templateSource).toMatch(/clienteNombre/);
  });

  it('template has a status pill with data-testid containing status-pill', () => {
    expect(templateSource).toMatch(/data-testid="[^"]*status-pill[^"]*"/);
  });

  // ── 5-state status pill Tailwind classes ──────────────────────
  it('template references bg-success (Confirmado)', () => {
    expect(templateSource).toMatch(/bg-success/);
  });

  it('template references bg-warning (Pendiente de seña)', () => {
    expect(templateSource).toMatch(/bg-warning/);
  });

  it('template references bg-primary (Walk-in)', () => {
    expect(templateSource).toMatch(/bg-primary/);
  });

  it('template references bg-error (Cancelado)', () => {
    expect(templateSource).toMatch(/bg-error/);
  });

  it('template references bg-error/80 (No-show)', () => {
    // Handle both raw "/" and escaped "\\/" in regex source
    expect(templateSource).toMatch(/bg-error(?:\/|\\\/)80/);
  });

  // ── NO hover actions ────────────────────────────────────────────
  it('has NO :hover selectors in styles', () => {
    expect(componentSource).not.toMatch(/:hover/);
  });

  it('has NO (mouseenter) handlers', () => {
    expect(templateSource).not.toMatch(/\(mouseenter\)/);
  });

  it('has NO (mouseleave) handlers', () => {
    expect(templateSource).not.toMatch(/\(mouseleave\)/);
  });

  // ── NO admin action references ──────────────────────────────────
  it('has NO cancelar keyword', () => {
    expect(componentSource + templateSource).not.toMatch(/cancelar/i);
  });

  it('has NO reprogramar keyword', () => {
    expect(componentSource + templateSource).not.toMatch(/reprogramar/i);
  });

  it('has NO bloquear keyword', () => {
    expect(componentSource + templateSource).not.toMatch(/bloquear/i);
  });

  // ── NO offline persistence (Fase 1.6) ──────────────────────────
  it('has NO localStorage references', () => {
    expect(componentSource + templateSource).not.toMatch(/localStorage/);
  });

  it('has NO sessionStorage references', () => {
    expect(componentSource + templateSource).not.toMatch(/sessionStorage/);
  });
});
