import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./mobile-turno-detail.component.ts', import.meta.url), 'utf8');

describe('MobileTurnoDetailComponent capability-service consumer', () => {
  it('does not import TurnoService or turno.facade', () => {
    expect(source).not.toMatch(/turno\.facade/);
    expect(source).not.toMatch(/\bTurnoService\b/);
  });

  it('loads the id fallback through BookingQueries into a signal', () => {
    expect(source).toMatch(/BOOKING_QUERIES|BookingQueries/);
    expect(source).toMatch(/listBookingsByBranch/);
    expect(source).toMatch(/signal</);
  });

  it('keeps router state as the primary path and optional-chaining on the fallback', () => {
    expect(source).toMatch(/getCurrentNavigation\(\)\?\.extras\.state/);
    expect(source).toMatch(/turno\(\)\?\.cliente\?\.telefono/);
  });
});
