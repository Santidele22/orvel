import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAdminBookingRepository } from '../admin-booking.repository';

const manual = {
  businessId: 'biz-1',
  branchId: 'branch-1',
  serviceId: 'svc-1',
  startsAtIso: '2026-08-17T13:00:00.000Z',
  durationMinutes: 30,
  clientId: 'cust-1',
  professionalId: 'pro-1',
  performedBy: 'admin-1',
  notes: 'walk-in'
};
const repo = (rpc: ReturnType<typeof vi.fn>) =>
  new SupabaseAdminBookingRepository({ rpc } as unknown as SupabaseClient);

describe('SupabaseAdminBookingRepository contract', () => {
  it('creates, reschedules, cancels, and loads availability via pinned RPCs', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', status: 'confirmed' }, error: null })
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', starts_at_iso: '2026-08-17T14:00:00.000Z' }, error: null })
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', status: 'cancelled' }, error: null })
      .mockResolvedValueOnce({
        data: [{ starts_at_iso: '2026-08-17T13:00:00.000Z', ends_at_iso: '2026-08-17T13:30:00.000Z', remaining_capacity: 1 }],
        error: null
      });
    const r = repo(rpc);

    expect(await r.createManualBooking(manual)).toEqual({
      status: 201,
      data: { bookingId: 'b-1', status: 'confirmed' }
    });
    expect(
      await r.reschedule({
        bookingId: 'b-1',
        performedBy: 'admin-1',
        notes: 'm',
        reason: 'c',
        startsAtIso: '2026-08-17T14:00:00.000Z',
        branchId: 'branch-1'
      })
    ).toEqual({ status: 200, data: { bookingId: 'b-1', startsAtIso: '2026-08-17T14:00:00.000Z' } });
    expect(
      await r.cancel({ bookingId: 'b-1', performedBy: 'admin-1', notes: 'x', reason: 'y', branchId: 'branch-1' })
    ).toEqual({ status: 200, data: { bookingId: 'b-1', status: 'cancelled' } });
    expect(
      await r.loadAvailabilityWindows({
        fecha: new Date('2026-08-17T00:00:00.000Z'),
        durationMinutes: 30,
        serviceId: 'svc-1',
        branchId: 'branch-1',
        context: 'admin-create',
        bookingId: null,
        businessId: 'biz-1',
        dateIso: '2026-08-17'
      })
    ).toEqual({
      status: 200,
      data: [{ startsAtIso: '2026-08-17T13:00:00.000Z', endsAtIso: '2026-08-17T13:30:00.000Z', remainingCapacity: 1 }]
    });
    expect(rpc.mock.calls.map((call) => call[0])).toEqual([
      'create_admin_manual_booking',
      'reschedule_admin_booking',
      'cancel_admin_booking',
      'query_admin_slot_availability'
    ]);
  });

  it('normalizes a single-row availability payload to an array', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { starts_at_iso: '2026-08-17T13:00:00.000Z', ends_at_iso: '2026-08-17T13:30:00.000Z', remaining_capacity: 1 },
      error: null
    });

    expect(
      await repo(rpc).loadAvailabilityWindows({
        fecha: new Date('2026-08-17T00:00:00.000Z'),
        durationMinutes: 30,
        serviceId: 'svc-1',
        branchId: 'branch-1',
        context: 'admin-create',
        bookingId: null,
        businessId: 'biz-1',
        dateIso: '2026-08-17'
      })
    ).toEqual({
      status: 200,
      data: [{ startsAtIso: '2026-08-17T13:00:00.000Z', endsAtIso: '2026-08-17T13:30:00.000Z', remainingCapacity: 1 }]
    });
  });

  it('maps cancel and reschedule not-found RPC errors to status 400', async () => {
    const cancelResult = await repo(
      vi.fn().mockResolvedValue({ data: null, error: { message: 'TURNO_NOT_FOUND: Turno no encontrado', code: 'P0001' } })
    ).cancel({ bookingId: 'missing', performedBy: 'admin-1', notes: 'x', reason: 'y', branchId: 'branch-1' });
    expect(cancelResult.status).toBe(400);
    expect(cancelResult.error?.message).toMatch(/not found|TURNO_NOT_FOUND/i);

    const rescheduleResult = await repo(
      vi.fn().mockResolvedValue({ data: null, error: { message: 'booking not found', code: 'P0001' } })
    ).reschedule({
      bookingId: 'missing',
      performedBy: 'admin-1',
      notes: 'm',
      reason: 'c',
      startsAtIso: '2026-08-17T14:00:00.000Z',
      branchId: 'branch-1'
    });
    expect(rescheduleResult.status).toBe(400);
    expect(rescheduleResult.error?.message).toMatch(/not found|TURNO_NOT_FOUND/i);
  });
});
