import { ApiResponse, BusinessPublicView, PublicSlotAvailabilityInput, PublicBookingPayload, ManageBookingInput, CancelBookingByTokenInput, RescheduleBookingByTokenInput, AdminManualBookingPayload, AdminBlockedTimePayload, AdminUpdateBookingPayload, AdminCancelBookingPayload, AdminRescheduleBookingPayload, AdminStatusUpdatePayload, PublicSlot, PublicBookingConfirmation, ManageBookingDetails } from '../../types';
import { SupabaseBookingGateway } from '../../gateway-interface';
import { RealSupabaseBookingGateway } from './real-gateway';
import { createSupabaseClient } from './supabase-client.factory';

// Default gateway is the real Supabase adapter. Consumers that need a different
// gateway (tests, feature providers) override it via setSupabaseBookingGateway.
let gateway: SupabaseBookingGateway | null = null;

function createDefaultGateway(): SupabaseBookingGateway {
  return new RealSupabaseBookingGateway(createSupabaseClient());
}

function currentGateway(): SupabaseBookingGateway {
  return gateway ?? createDefaultGateway();
}

export function setSupabaseBookingGateway(nextGateway: SupabaseBookingGateway): void {
  gateway = nextGateway;
}

export async function resolveBusinessBySlug(input: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
  return currentGateway().resolveBusinessBySlug(input);
}

export async function queryPublicSlotAvailability(
  input: PublicSlotAvailabilityInput
): Promise<ApiResponse<{ slots: PublicSlot[] }>> {
  const maybeFn = (gateway as Partial<SupabaseBookingGateway>).queryPublicSlotAvailability;
  if (typeof maybeFn === 'function') {
    return maybeFn(input);
  }
  return createDefaultGateway().queryPublicSlotAvailability(input);
}

export async function createPublicBooking(
  payload: PublicBookingPayload
): Promise<ApiResponse<PublicBookingConfirmation>> {
  return currentGateway().createPublicBooking(payload);
}

export async function manageBookingByToken(input: ManageBookingInput): Promise<ApiResponse<ManageBookingDetails>> {
  return currentGateway().manageBookingByToken(input);
}

export async function cancelBookingByToken(
  input: CancelBookingByTokenInput
): Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>> {
  const maybeFn = (gateway as Partial<SupabaseBookingGateway>).cancelBookingByToken;
  if (typeof maybeFn === 'function') {
    return maybeFn(input);
  }
  return createDefaultGateway().cancelBookingByToken(input);
}

export async function rescheduleBookingByToken(
  input: RescheduleBookingByTokenInput
): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
  const maybeFn = (gateway as Partial<SupabaseBookingGateway>).rescheduleBookingByToken;
  if (typeof maybeFn === 'function') {
    return maybeFn(input);
  }
  return createDefaultGateway().rescheduleBookingByToken(input);
}

export async function createAdminManualBooking(payload: AdminManualBookingPayload): Promise<
  ApiResponse<{
    bookingId: string;
    type: 'manual-admin-appointment';
    status: 'confirmed';
    source: 'admin-manual';
  }>
> {
  return currentGateway().createAdminManualBooking(payload);
}

export async function createAdminBlockedTime(
  payload: AdminBlockedTimePayload
): Promise<ApiResponse<{ blockId: string; type: 'blocked-time' }>> {
  return currentGateway().createAdminBlockedTime(payload);
}

export async function updateAdminBooking(
  payload: AdminUpdateBookingPayload
): Promise<ApiResponse<{ bookingId: string; updatedAt: string }>> {
  return currentGateway().updateAdminBooking(payload);
}

export async function cancelAdminBooking(
  payload: AdminCancelBookingPayload
): Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>> {
  return currentGateway().cancelAdminBooking(payload);
}

export async function rescheduleAdminBooking(
  payload: AdminRescheduleBookingPayload
): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
  return currentGateway().rescheduleAdminBooking(payload);
}

export async function updateBookingStatus(
  payload: AdminStatusUpdatePayload
): Promise<ApiResponse<{ bookingId: string; status: string }>> {
  return currentGateway().updateBookingStatus(payload);
}
