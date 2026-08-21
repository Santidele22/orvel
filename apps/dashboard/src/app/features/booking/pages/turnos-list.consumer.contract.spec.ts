import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./turnos-list.page.ts', import.meta.url), 'utf8');

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
});
