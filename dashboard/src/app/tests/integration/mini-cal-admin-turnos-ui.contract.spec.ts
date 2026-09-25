import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readTurnosListSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.html');
  return `${readFileSync(tsPath, 'utf-8')}\n${readFileSync(htmlPath, 'utf-8')}`;
}

describe('Mini Calendly admin turnos UI RED contract', () => {
  it('keeps turnos list with cancel/reschedule semantic actions', () => {
    const source = readTurnosListSource();

    expect(source).toMatch(/data-testid=["']turno-admin-cancel-action["']/i);
    expect(source).toMatch(/data-testid=["']turno-admin-reschedule-action["']/i);
    expect(source).toMatch(/(cancelTurnoByAdmin|cancelByAdmin)\(/);
    expect(source).toMatch(/rescheduleByAdmin\(/);
  });

  it('adds manual booking creation flow using existing API adapter (no duplicated gateway logic)', () => {
    const source = readTurnosListSource();

    expect(source).toMatch(/from\s+['"]@orvel\/booking['"]/);
    expect(source).toMatch(/createAdminManualBooking\(/);
    expect(source).toMatch(/data-testid=["']turno-admin-manual-booking-open["']/i);
    expect(source).toMatch(/data-testid=["']turno-admin-manual-booking-submit["']/i);
    expect(source).toMatch(/data-testid=["']turno-admin-manual-booking-success["']/i);
    expect(source).not.toMatch(/createSupabaseBookingGateway\(/);
  });

  it('adds blocked-time creation flow using API adapter and deterministic collision feedback', () => {
    const source = readTurnosListSource();

    expect(source).toMatch(/createAdminBlockedTime\(/);
    expect(source).toMatch(/data-testid=["']turno-admin-blocked-time-open["']/i);
    expect(source).toMatch(/data-testid=["']turno-admin-blocked-time-submit["']/i);
    expect(source).toMatch(/data-testid=["']turno-admin-blocked-time-collision["']/i);
    expect(source).toMatch(/(BLOCKED_TIME_COLLISION|blocked time collision)/i);
    expect(source).toMatch(/(processTurnos\(|refreshTurnos\()/);
  });
});
