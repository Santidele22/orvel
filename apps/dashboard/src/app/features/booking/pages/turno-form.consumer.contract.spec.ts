import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./turno-form.page.ts', import.meta.url), 'utf8');

describe('TurnoFormPage capability-service consumer', () => {
  it('does not import TurnoService or turno.facade', () => {
    expect(source).not.toMatch(/turno\.facade/);
    expect(source).not.toMatch(/\bTurnoService\b/);
  });

  it('injects CRUD, scheduling, and availability services', () => {
    expect(source).toMatch(/inject\(\s*BookingCrudService/);
    expect(source).toMatch(/inject\(\s*BookingSchedulingService/);
    expect(source).toMatch(/inject\(\s*BookingAvailabilityService/);
  });

  it('awaits capability Promises and resolves scope from AuthService and branchContext', () => {
    expect(source).toMatch(/authService\.user\(/);
    expect(source).toMatch(/branchContext\.getActiveBranchId\(/);
    expect(source).not.toMatch(/turnoService\.(create|getById|rescheduleByAdmin|ensureDefaultBranchId|loadAvailabilityAdminSlotTimes)/);
    expect(source).not.toMatch(/scheduling\.(create|rescheduleByAdmin)\([^)]*\)\.toPromise\(\)/);
  });
});
