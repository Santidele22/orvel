import { ApiResponse, BusinessPublicView, PublicSlotAvailabilityInput, PublicBookingPayload, ManageBookingInput, CancelBookingByTokenInput, RescheduleBookingByTokenInput, AdminManualBookingPayload, AdminBlockedTimePayload, AdminUpdateBookingPayload, AdminCancelBookingPayload, AdminRescheduleBookingPayload, AdminStatusUpdatePayload, PublicSlot, PublicBookingConfirmation, ManageBookingDetails } from './types';
import { SupabaseBookingGateway } from './gateway-interface';
import { realSupabaseGateway } from './real-gateway';

// Use real Supabase gateway by default
let gateway: SupabaseBookingGateway = realSupabaseGateway;

export function setSupabaseBookingGateway(nextGateway: SupabaseBookingGateway): void {
  gateway = nextGateway;
}

export async function resolveBusinessBySlug(input: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
  return gateway.resolveBusinessBySlug(input);
}

export async function queryPublicSlotAvailability(
  input: PublicSlotAvailabilityInput
): Promise<ApiResponse<{ slots: PublicSlot[] }>> {
  const maybeFn = (gateway as Partial<SupabaseBookingGateway>).queryPublicSlotAvailability;
  if (typeof maybeFn === 'function') {
    return maybeFn(input);
  }
  return realSupabaseGateway.queryPublicSlotAvailability(input);
}

export async function createPublicBooking(
  payload: PublicBookingPayload
): Promise<ApiResponse<PublicBookingConfirmation>> {
  return gateway.createPublicBooking(payload);
}

export async function manageBookingByToken(input: ManageBookingInput): Promise<ApiResponse<ManageBookingDetails>> {
  return gateway.manageBookingByToken(input);
}

export async function cancelBookingByToken(
  input: CancelBookingByTokenInput
): Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>> {
  const maybeFn = (gateway as Partial<SupabaseBookingGateway>).cancelBookingByToken;
  if (typeof maybeFn === 'function') {
    return maybeFn(input);
  }
  return realSupabaseGateway.cancelBookingByToken(input);
}

export async function rescheduleBookingByToken(
  input: RescheduleBookingByTokenInput
): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
  const maybeFn = (gateway as Partial<SupabaseBookingGateway>).rescheduleBookingByToken;
  if (typeof maybeFn === 'function') {
    return maybeFn(input);
  }
  return realSupabaseGateway.rescheduleBookingByToken(input);
}

export async function createAdminManualBooking(payload: AdminManualBookingPayload): Promise<
  ApiResponse<{
    bookingId: string;
    type: 'manual-admin-appointment';
    status: 'confirmed';
    source: 'admin-manual';
  }>
> {
  return gateway.createAdminManualBooking(payload);
}

export async function createAdminBlockedTime(
  payload: AdminBlockedTimePayload
): Promise<ApiResponse<{ blockId: string; type: 'blocked-time' }>> {
  return gateway.createAdminBlockedTime(payload);
}

export async function updateAdminBooking(
  payload: AdminUpdateBookingPayload
): Promise<ApiResponse<{ bookingId: string; updatedAt: string }>> {
  return gateway.updateAdminBooking(payload);
}

export async function cancelAdminBooking(
  payload: AdminCancelBookingPayload
): Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>> {
  return gateway.cancelAdminBooking(payload);
}

export async function rescheduleAdminBooking(
  payload: AdminRescheduleBookingPayload
): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
  return gateway.rescheduleAdminBooking(payload);
}

export async function updateBookingStatus(
  payload: AdminStatusUpdatePayload
): Promise<ApiResponse<{ bookingId: string; status: string }>> {
  return gateway.updateBookingStatus(payload);
}
