import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./turnos-list.page.ts', import.meta.url), 'utf8');
const template = readFileSync(new URL('./turnos-list.page.html', import.meta.url), 'utf8');
const turnoModel = readFileSync(new URL('../models/turno.model.ts', import.meta.url), 'utf8');

describe('TurnosListPage capability-service consumer', () => {
  it('does not import TurnoService or turno.facade', () => {
    expect(source).not.toMatch(/turno\.facade/);
    expect(source).not.toMatch(/\bTurnoService\b/);
  });

  it('injects CRUD, scheduling, availability, and notifications services', () => {
    expect(source).toMatch(/inject\(\s*BookingCrudService/);
    expect(source).toMatch(/inject\(\s*BookingSchedulingService/);
    expect(source).toMatch(/inject\(\s*BookingAvailabilityService/);
    expect(source).toMatch(/inject\(\s*BookingNotificationsService/);
  });

  it('resolves branch scope from AuthService and branchContext, not a facade helper', () => {
    expect(source).toMatch(/authService\.user\(/);
    expect(source).toMatch(/branchContext\.getActiveBranchId\(/);
    expect(source).not.toMatch(/turnoService\.ensureDefaultBranchId/);
    expect(source).not.toMatch(/turnoService\.getActiveBranchId/);
  });

  it('shows a desktop empty state instead of a red error when there are no turnos', () => {
    expect(template).toContain('data-testid="turnos-desktop-empty-state"');
    expect(template).toContain('Todavía no hay turnos este día');
    expect(template).toMatch(/turnosLoadError\(\)\s*&&\s*hasAnyTurnos\(\)/);
  });

  it('types optional depositStatus on Turno from BookingDepositStatus', () => {
    expect(turnoModel).toMatch(/depositStatus\?:\s*BookingDepositStatus/);
    expect(turnoModel).toMatch(/from ['"]@orvel\/booking\/application['"]/);
  });

  it('desktop status pill uses appointment badge helper, not raw estado', () => {
    expect(template).not.toMatch(/\{\{\s*turno\.estado\s*\}\}/);
    expect(template).toMatch(/appointmentBadgeLabel\(\s*turno\s*\)/);
    expect(template).toMatch(/depositPending\s*\(\s*turno\s*\)|isDepositUnpaid/);
    expect(template).toMatch(/bg-amber-400\/10|bg-warning/);
    expect(source).toMatch(/appointmentStatusLabel/);
    expect(source).toMatch(/isDepositUnpaid/);
    expect(source).toMatch(/from ['"]@orvel\/booking\/application['"]/);
  });
});
