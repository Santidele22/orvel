import { InjectionToken } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AdminAvailabilityRequest,
  AdminBookingRepository,
  AdminFailureTelemetryInput,
  AdminRpcResult
} from '../../application/ports/admin-booking.repository';
import type {
  AdminBlockedTimePayload,
  AdminCancelBookingPayload,
  AdminManualBookingPayload,
  AdminRescheduleBookingPayload,
  AdminStatusUpdatePayload,
  AdminUpdateBookingPayload,
  ApiResponse
} from '../../types';
import { mapRpcErrorToApiError } from './mappers';

export const ADMIN_BOOKING_REPOSITORY = new InjectionToken<AdminBookingRepository>('ADMIN_BOOKING_REPOSITORY');
type Row = Record<string, unknown>;

export class SupabaseAdminBookingRepository implements AdminBookingRepository {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  createManualBooking(p: AdminManualBookingPayload) {
    return this.call('create_admin_manual_booking', {
      business_id: p.businessId, branch_id: p.branchId, service_id: p.serviceId, starts_at_iso: p.startsAtIso,
      duration_minutes: p.durationMinutes, client_id: p.clientId, walk_in_name: p.walkInName,
      professional_id: p.professionalId, performed_by: p.performedBy, notes: p.notes
    }, 201, (r) => ({ bookingId: String(r['booking_id'] ?? ''), status: String(r['status'] ?? 'confirmed') }));
  }

  reschedule(p: AdminRescheduleBookingPayload & { branchId: string }) {
    return this.call('reschedule_admin_booking', {
      booking_id: p.bookingId, starts_at_iso: p.startsAtIso, branch_id: p.branchId,
      performed_by: p.performedBy, notes: p.notes, reason: p.reason
    }, 200, (r) => ({ bookingId: String(r['booking_id'] ?? p.bookingId), startsAtIso: String(r['starts_at_iso'] ?? p.startsAtIso) }));
  }

  cancel(p: AdminCancelBookingPayload & { branchId: string }) {
    return this.call('cancel_admin_booking', {
      booking_id: p.bookingId, branch_id: p.branchId, performed_by: p.performedBy, notes: p.notes, reason: p.reason
    }, 200, (r) => ({ bookingId: String(r['booking_id'] ?? p.bookingId), status: String(r['status'] ?? 'cancelled') }));
  }

  updateBlockedTime(p: AdminBlockedTimePayload) {
    return this.call('create_admin_blocked_time', {
      business_id: p.businessId, branch_id: p.branchId, starts_at_iso: p.startsAtIso,
      ends_at_iso: p.endsAtIso, reason: p.reason, performed_by: p.performedBy
    }, 201, (r) => ({ blockId: String(r['blocked_time_id'] ?? '') }));
  }

  updateStatus(p: AdminStatusUpdatePayload) {
    return this.call('update_booking_status', { booking_id: p.bookingId, status: p.status, performed_by: p.performedBy },
      200, (r) => ({ bookingId: String(r['booking_id'] ?? p.bookingId), status: String(r['status'] ?? p.status) }));
  }

  loadAvailabilityWindows(req: AdminAvailabilityRequest) {
    return this.call('query_admin_slot_availability', {
      business_id: req.businessId, service_id: req.serviceId ?? null, date_iso: req.dateIso, branch_id: req.branchId,
      context: req.context ?? 'admin-create', booking_id: req.bookingId ?? null, duration_minutes: req.durationMinutes ?? null
    }, 200, (row) => ((Array.isArray(row) ? row : row ? [row] : []) as Row[]).map((item) => ({
      startsAtIso: String(item['starts_at_iso'] ?? ''), endsAtIso: String(item['ends_at_iso'] ?? ''),
      remainingCapacity: Number(item['remaining_capacity'] ?? 0)
    })).filter((slot) => slot.startsAtIso && slot.endsAtIso && slot.remainingCapacity > 0), true);
  }

  updateBooking(p: AdminUpdateBookingPayload) {
    return this.call('update_admin_booking', {
      booking_id: p.bookingId, performed_by: p.performedBy, notes: p.notes, reason: p.reason,
      client_id: p.clientId, service_id: p.serviceId, duration_minutes: p.durationMinutes
    }, 200, (r) => ({
      bookingId: String(r['booking_id'] ?? p.bookingId), updatedAt: String(r['updated_at'] ?? new Date().toISOString()),
      customerId: r['customer_id'] as string | null | undefined, serviceId: r['service_id'] as string | null | undefined,
      durationMinutes: r['duration_minutes'] as number | null | undefined,
      startsAtIso: r['starts_at_iso'] as string | null | undefined, endsAtIso: r['ends_at_iso'] as string | null | undefined
    }));
  }

  listBookings(branchId: string) { return this.invoke('list_admin_bookings', { p_branch_id: branchId }); }
  listDashboardBranches(businessId: string) { return this.invoke('get_dashboard_branches', { p_business_id: businessId }); }
  assertBookingInBranch(bookingId: string, branchId: string) {
    return this.invoke('assert_admin_booking_in_branch', { p_booking_id: bookingId, p_branch_id: branchId });
  }
  invoke(name: string, args: Record<string, unknown>) { return this.raw(name, args); }
  recordCancelFailure(input: AdminFailureTelemetryInput) { return this.telemetry('record_admin_booking_cancel_failure', input); }
  recordRescheduleFailure(input: AdminFailureTelemetryInput) { return this.telemetry('record_admin_booking_reschedule_failure', input); }

  private async call<T>(name: string, args: Record<string, unknown>, status: number, map: (row: Row) => T, rawArray = false): Promise<ApiResponse<T>> {
    const { data, error } = await this.supabaseClient.rpc(name, args);
    if (error) return { status: 400, error: mapRpcErrorToApiError(error) };
    return { status, data: map(rawArray ? (data as Row) : ((data ?? {}) as Row)) };
  }

  private async raw(name: string, args: Record<string, unknown>): Promise<AdminRpcResult> {
    const { data, error } = await this.supabaseClient.rpc(name, args);
    return { data, error };
  }

  private async telemetry(name: string, input: AdminFailureTelemetryInput): Promise<void> {
    try {
      await this.supabaseClient.rpc(name, { p_stage: input.stage, p_code: input.code, p_status: input.status, p_retryable: input.retryable ?? true });
    } catch { /* telemetry must never block admin UX */ }
  }
}
