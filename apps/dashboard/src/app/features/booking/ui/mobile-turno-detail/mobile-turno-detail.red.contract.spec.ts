import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

const COMPONENT_PATH = new URL('./mobile-turno-detail.component.ts', import.meta.url);
const TEMPLATE_PATH = new URL('./mobile-turno-detail.component.html', import.meta.url);
const ROUTES_PATH = new URL('../../../../app.routes.ts', import.meta.url);

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

const routesSource = (() => {
  try {
    return fs.readFileSync(ROUTES_PATH, 'utf8');
  } catch {
    return '';
  }
})();

describe('MobileTurnoDetailComponent contract', () => {
  // ── Component file existence ──────────────────────────────────────────
  it('component file exists at the expected path', () => {
    expect(componentSource, 'mobile-turno-detail.component.ts must exist').not.toBe('');
  });

  it('template file exists at the expected path', () => {
    expect(templateSource, 'mobile-turno-detail.component.html must exist').not.toBe('');
  });

  // ── R1 — Router state vs service fallback ─────────────────────────────
  it('R1a: resolves state from getCurrentNavigation()?.extras.state first', () => {
    expect(componentSource).toMatch(/getCurrentNavigation\(\)\?\.extras\.state/);
  });

  it('R1b: falls back to TurnoService.items().find()', () => {
    expect(componentSource).toMatch(/items\(\)\.find\b/  );
  });

  it('R1c: turno computed is typed TurnoWithRelations (avoid union with raw Turno)', () => {
    // Without the explicit generic, the computed result is `TurnoWithRelations | Turno | undefined`
    // (TurnoService.items() returns Turno[]), which makes `turno()?.clienteNombre` fail to compile
    // under Angular's strictTemplates. The generic parameter is the structural guard.
    expect(componentSource).toMatch(/computed<[^>]*TurnoWithRelations[^>]*>/);
  });

  // ── R2 — Mobile-only viewport gating ──────────────────────────────────
  it('R2: template wraps content in @if (isMobile())', () => {
    expect(templateSource).toMatch(/@if\s*\(\s*isMobile\s*(\(\))?\s*\)/);
  });

  it('R2: component creates isMobile signal from createIsMobileSignal', () => {
    expect(componentSource).toMatch(/createIsMobileSignal/);
  });

  it('R2: component exports isMobile as Signal or computed', () => {
    expect(componentSource).toMatch(/isMobile\s*(:|=)/);
  });

  // ── R3a — tel: anchor ────────────────────────────────────────────────
  it('R3a: template has href="tel:... link for Llamar', () => {
    expect(templateSource).toMatch(/href="tel:/);
  });

  // ── R3b — Hide Llamar when no telefono ───────────────────────────────
  it('R3b: Llamar anchor is gated behind @if (telefono)', () => {
    expect(templateSource).toMatch(/@if\s*\(\s*telefono\s*(\(\))?\s*\)/);
  });

  it('R3b: telefono computed from turno()?.cliente?.telefono', () => {
    expect(componentSource).toMatch(/cliente\?\.telefono/);
  });

  // ── R4 — Back navigation ─────────────────────────────────────────────
  it('R4: back() navigates to /dashboard/turnos', () => {
    expect(componentSource).toMatch(/router\.navigate\(\[.*dashboard\/turnos/);
  });

  // ── R5 — Invalid id empty state ──────────────────────────────────────
  it('R5: template has data-testid="mobile-turno-detail-empty" for empty state', () => {
    expect(templateSource).toMatch(/data-testid="mobile-turno-detail-empty"/);
  });

  it('R5: isEmpty computed when turno() === undefined', () => {
    expect(componentSource).toMatch(/isEmpty/);
  });

  // ── Route ordering (app.routes.ts) ────────────────────────────────────
  it('turnos/:id route is declared AFTER turnos/edit/:id', () => {
    const matches = routesSource.match(/path:\s*'turnos\/(?!new|edit)[^']*'/g);
    const editMatch = routesSource.match(/path:\s*'turnos\/edit\/:id'/);
    expect(editMatch).not.toBeNull();
    // There should be at least one :id wildcard route after turnos/edit/:id
    const editIndex = routesSource.indexOf("turnos/edit/:id");
    const turnoIdIndex = routesSource.indexOf("turnos/:id");
    expect(turnoIdIndex).toBeGreaterThan(editIndex);
  });

  it('turnos/:id route loads MobileTurnoDetailComponent', () => {
    // Either lazy import references MobileTurnoDetailComponent or path maps to it
    expect(routesSource).toMatch(/MobileTurnoDetailComponent/);
  });

  // ── Standalone (no NgModule) ─────────────────────────────────────────
  it('component is standalone (standalone: true)', () => {
    expect(componentSource).toMatch(/standalone:\s*true/);
  });

  // ── No subscribe ─────────────────────────────────────────────────────
  it('component does NOT contain .subscribe()', () => {
    expect(componentSource).not.toMatch(/\.subscribe\(/);
  });

  // ── No console.log / console.error that escapes to user ───────────────
  it('component does NOT contain console.log or console.error', () => {
    expect(componentSource).not.toMatch(/console\.(log|error)\s*\(/);
  });
});
