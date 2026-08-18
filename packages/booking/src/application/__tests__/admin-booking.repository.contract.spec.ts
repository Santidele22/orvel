import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseAdminBookingRepository } from '../../infrastructure/supabase/admin-booking.repository';

const manual = {
  businessId: 'biz-1', branchId: 'branch-1', serviceId: 'svc-1', startsAtIso: '2026-08-17T13:00:00.000Z',
  durationMinutes: 30, clientId: 'cust-1', professionalId: 'pro-1', performedBy: 'admin-1', notes: 'walk-in'
};
const repo = (rpc: ReturnType<typeof vi.fn>) => new SupabaseAdminBookingRepository({ rpc } as unknown as SupabaseClient);

describe('AdminBookingRepository contract', () => {
  it('pins admin RPC names and mapped payloads', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', status: 'confirmed' }, error: null })
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', starts_at_iso: '2026-08-17T14:00:00.000Z' }, error: null })
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', status: 'cancelled' }, error: null })
      .mockResolvedValueOnce({ data: { blocked_time_id: 'block-1' }, error: null })
      .mockResolvedValueOnce({ data: { booking_id: 'b-1', status: 'completed' }, error: null })
      .mockResolvedValueOnce({ data: [{ starts_at_iso: '2026-08-17T13:00:00.000Z', ends_at_iso: '2026-08-17T13:30:00.000Z', remaining_capacity: 1 }], error: null });
    const r = repo(rpc);
    expect(await r.createManualBooking(manual)).toEqual({ status: 201, data: { bookingId: 'b-1', status: 'confirmed' } });
    expect(await r.reschedule({ bookingId: 'b-1', performedBy: 'admin-1', notes: 'm', reason: 'c', startsAtIso: '2026-08-17T14:00:00.000Z', branchId: 'branch-1' }))
      .toEqual({ status: 200, data: { bookingId: 'b-1', startsAtIso: '2026-08-17T14:00:00.000Z' } });
    expect(await r.cancel({ bookingId: 'b-1', performedBy: 'admin-1', notes: 'x', reason: 'y', branchId: 'branch-1' }))
      .toEqual({ status: 200, data: { bookingId: 'b-1', status: 'cancelled' } });
    expect(await r.updateBlockedTime({ businessId: 'biz-1', branchId: 'branch-1', startsAtIso: '2026-08-17T13:00:00.000Z', endsAtIso: '2026-08-17T14:00:00.000Z', reason: 'lunch', performedBy: 'admin-1' }))
      .toEqual({ status: 201, data: { blockId: 'block-1' } });
    expect(await r.updateStatus({ bookingId: 'b-1', status: 'completed', performedBy: 'admin-1' }))
      .toEqual({ status: 200, data: { bookingId: 'b-1', status: 'completed' } });
    expect(await r.loadAvailabilityWindows({
      fecha: new Date('2026-08-17T00:00:00.000Z'), durationMinutes: 30, serviceId: 'svc-1',
      branchId: 'branch-1', context: 'admin-create', bookingId: null, businessId: 'biz-1', dateIso: '2026-08-17'
    })).toEqual({ status: 200, data: [{ startsAtIso: '2026-08-17T13:00:00.000Z', endsAtIso: '2026-08-17T13:30:00.000Z', remainingCapacity: 1 }] });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'create_admin_manual_booking', 'reschedule_admin_booking', 'cancel_admin_booking',
      'create_admin_blocked_time', 'update_booking_status', 'query_admin_slot_availability'
    ]);
    expect(rpc).toHaveBeenCalledWith('create_admin_manual_booking', {
      business_id: 'biz-1', branch_id: 'branch-1', service_id: 'svc-1', starts_at_iso: '2026-08-17T13:00:00.000Z',
      duration_minutes: 30, client_id: 'cust-1', walk_in_name: undefined, professional_id: 'pro-1', performed_by: 'admin-1', notes: 'walk-in'
    });
  });

  it('maps SLOT_CONFLICT and absorbs remaining admin RPCs', async () => {
    const created = await repo(vi.fn().mockResolvedValue({ data: null, error: { message: 'SLOT_CONFLICT', code: 'P0002' } })).createManualBooking(manual);
    expect(created.status).toBe(400);
    expect(created.error?.code).toBe('SLOT_CONFLICT');
    const rpc = vi.fn().mockResolvedValue({ data: { booking_id: 'b-1' }, error: null });
    const extra = repo(rpc);
    await extra.updateBooking({ bookingId: 'b-1', performedBy: 'admin-1', notes: 'n', clientId: 'c-1', serviceId: 's-1', durationMinutes: 45 });
    await extra.listBookings('branch-1');
    await extra.listDashboardBranches('biz-1');
    await extra.assertBookingInBranch('b-1', 'branch-1');
    await extra.recordCancelFailure({ stage: 'rpc', code: 'UNEXPECTED_FAILURE', status: 400, retryable: true });
    await extra.recordRescheduleFailure({ stage: 'ui', code: 'SLOT_UNAVAILABLE', status: 409, retryable: false });
    expect(rpc.mock.calls.map((c) => c[0])).toEqual([
      'update_admin_booking', 'list_admin_bookings', 'get_dashboard_branches',
      'assert_admin_booking_in_branch', 'record_admin_booking_cancel_failure', 'record_admin_booking_reschedule_failure'
    ]);
  });
});
