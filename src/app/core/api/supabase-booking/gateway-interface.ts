import { ApiResponse, BusinessPublicView, PublicSlotAvailabilityInput, PublicBookingPayload, ManageBookingInput, CancelBookingByTokenInput, RescheduleBookingByTokenInput, AdminManualBookingPayload, AdminBlockedTimePayload, AdminUpdateBookingPayload, AdminCancelBookingPayload, AdminRescheduleBookingPayload, AdminStatusUpdatePayload } from './types';

export type SupabaseBookingGateway = {
  resolveBusinessBySlug: (input: { businessSlug: string }) => Promise<ApiResponse<BusinessPublicView>>;
  queryPublicSlotAvailability: (
    input: PublicSlotAvailabilityInput
  ) => Promise<ApiResponse<{ slots: Array<{ startsAtIso: string; endsAtIso: string }> }>>;
  createPublicBooking: (
    payload: PublicBookingPayload
  ) => Promise<ApiResponse<{ bookingId: string; status: 'confirmed'; source: 'client-self-service' }>>;
  manageBookingByToken: (input: ManageBookingInput) => Promise<
    ApiResponse<{
      bookingId: string;
      businessId: string;
      serviceId: string;
      startsAtIso: string;
      canCancelOrReschedule: boolean;
    }>
  >;
  cancelBookingByToken: (input: CancelBookingByTokenInput) => Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>>;
  rescheduleBookingByToken: (
    input: RescheduleBookingByTokenInput
  ) => Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>>;
  createAdminManualBooking: (payload: AdminManualBookingPayload) => Promise<
    ApiResponse<{
      bookingId: string;
      type: 'manual-admin-appointment';
      status: 'confirmed';
      source: 'admin-manual';
    }>
  >;
  createAdminBlockedTime: (payload: AdminBlockedTimePayload) => Promise<ApiResponse<{ blockId: string; type: 'blocked-time' }>>;
  updateAdminBooking: (payload: AdminUpdateBookingPayload) => Promise<ApiResponse<{ bookingId: string; updatedAt: string }>>;
  cancelAdminBooking: (payload: AdminCancelBookingPayload) => Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>>;
  rescheduleAdminBooking: (payload: AdminRescheduleBookingPayload) => Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>>;
  updateBookingStatus: (payload: AdminStatusUpdatePayload) => Promise<ApiResponse<{ bookingId: string; status: string }>>;
};
