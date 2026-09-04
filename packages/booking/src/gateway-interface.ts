import { ApiResponse, BusinessPublicView, PublicSlotAvailabilityInput, PublicBookingPayload, ManageBookingInput, CancelBookingByTokenInput, RescheduleBookingByTokenInput, AdminManualBookingPayload, AdminBlockedTimePayload, AdminUpdateBookingPayload, AdminCancelBookingPayload, AdminRescheduleBookingPayload, AdminStatusUpdatePayload, ConfirmBookingDepositPayload, PublicSlot, PublicBookingConfirmation, ManageBookingDetails } from './types';

export type SupabaseBookingGateway = {
  resolveBusinessBySlug: (input: { businessSlug: string }) => Promise<ApiResponse<BusinessPublicView>>;
  queryPublicSlotAvailability: (
    input: PublicSlotAvailabilityInput
  ) => Promise<ApiResponse<{ slots: PublicSlot[] }>>;
  createPublicBooking: (
    payload: PublicBookingPayload
  ) => Promise<ApiResponse<PublicBookingConfirmation>>;
  manageBookingByToken: (input: ManageBookingInput) => Promise<ApiResponse<ManageBookingDetails>>;
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
  confirmBookingDepositReceived: (
    payload: ConfirmBookingDepositPayload
  ) => Promise<ApiResponse<{ bookingId: string; depositStatus: string }>>;
};
