import type {
  AdminBlockedTimePayload,
  AdminCancelBookingPayload,
  AdminManualBookingPayload,
  AdminRescheduleBookingPayload,
  AdminStatusUpdatePayload,
  AdminUpdateBookingPayload,
  ApiResponse
} from '../../types';

export type AdminAvailabilityRequest = {
  fecha: Date;
  durationMinutes: number;
  serviceId?: string | null;
  branchId?: string | null;
  context?: 'admin-create' | 'admin-update' | 'admin-reschedule';
  bookingId?: string | null;
  businessId?: string;
  dateIso?: string;
};

export type AdminSlotAvailabilityRow = { startsAtIso: string; endsAtIso: string; remainingCapacity: number };
export type AdminBookingMutationResult = {
  bookingId: string; status?: string; startsAtIso?: string | null; updatedAt?: string;
  customerId?: string | null; serviceId?: string | null; durationMinutes?: number | null; endsAtIso?: string | null;
};
export type AdminRpcResult = { data: unknown; error: { message?: string; code?: string } | null };
export type AdminFailureTelemetryInput = { stage: 'rpc' | 'ui'; code: string; status?: number; retryable?: boolean };

export interface AdminBookingRepository {
  createManualBooking(payload: AdminManualBookingPayload): Promise<ApiResponse<AdminBookingMutationResult>>;
  reschedule(payload: AdminRescheduleBookingPayload & { branchId: string }): Promise<ApiResponse<AdminBookingMutationResult>>;
  cancel(payload: AdminCancelBookingPayload & { branchId: string }): Promise<ApiResponse<AdminBookingMutationResult>>;
  updateBlockedTime(payload: AdminBlockedTimePayload): Promise<ApiResponse<{ blockId: string }>>;
  updateStatus(payload: AdminStatusUpdatePayload): Promise<ApiResponse<AdminBookingMutationResult>>;
  loadAvailabilityWindows(req: AdminAvailabilityRequest): Promise<ApiResponse<AdminSlotAvailabilityRow[]>>;
  updateBooking(payload: AdminUpdateBookingPayload): Promise<ApiResponse<AdminBookingMutationResult>>;
  listBookings(branchId: string): Promise<AdminRpcResult>;
  listDashboardBranches(businessId: string): Promise<AdminRpcResult>;
  assertBookingInBranch(bookingId: string, branchId: string): Promise<AdminRpcResult>;
  recordCancelFailure(input: AdminFailureTelemetryInput): Promise<void>;
  recordRescheduleFailure(input: AdminFailureTelemetryInput): Promise<void>;
  invoke(name: string, args: Record<string, unknown>): Promise<AdminRpcResult>;
}
