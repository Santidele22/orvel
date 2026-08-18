import { describe, expectTypeOf, it } from 'vitest';
import { AdminManualBookingPayload } from '../features/booking/data-access/turno.facade';

describe('Turno manual booking payload contract', () => {
  it('defines expected AdminManualBookingPayload structure in TurnoService', () => {
    const payload: AdminManualBookingPayload = {
      businessId: 'biz-qa-001',
      serviceId: 'svc-qa-001',
      startsAtIso: '2026-05-10T16:00:00.000Z',
      durationMinutes: 30,
      professionalId: 'pro-qa-001',
      performedBy: 'admin'
    };

    expectTypeOf(payload.businessId).toEqualTypeOf<string>();
    expectTypeOf(payload.durationMinutes).toEqualTypeOf<number>();
  });
});
