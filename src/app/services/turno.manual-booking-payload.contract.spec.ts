import { describe, expectTypeOf, it } from 'vitest';
import { createAdminManualBooking } from '../core/api/supabase-booking.api';

type AdminManualPayload = Parameters<typeof createAdminManualBooking>[0];

describe('Turno manual booking payload contract', () => {
  it('keeps Turno service payload aligned with createAdminManualBooking input', () => {
    const payload: AdminManualPayload = {
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
