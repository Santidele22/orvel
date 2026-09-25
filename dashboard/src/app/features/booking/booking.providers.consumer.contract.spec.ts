import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const providers = readFileSync(new URL('./booking.providers.ts', import.meta.url), 'utf8');
const testbed = readFileSync(new URL('../../tests/helpers/turno-service-testbed.ts', import.meta.url), 'utf8');

describe('provideBooking and testbed after facade retirement', () => {
  it('does not register TurnoService or import turno.facade', () => {
    expect(providers).not.toMatch(/TurnoService/);
    expect(providers).not.toMatch(/turno\.facade/);
  });

  it('testbed fakes capability services instead of importing TurnoService', () => {
    expect(testbed).not.toMatch(/turno\.facade/);
    expect(testbed).not.toMatch(/import\s*\{[^}]*\bTurnoService\b/);
    expect(testbed).toMatch(/BookingCrudService|createMockBookingCrud/);
    expect(testbed).toMatch(/BookingSchedulingService|createMockBookingScheduling/);
  });
});

