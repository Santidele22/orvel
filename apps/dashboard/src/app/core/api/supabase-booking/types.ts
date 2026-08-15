// Re-export shim for the @orvel/booking migration window.
// Types live in @orvel/booking. Kept for migration; delete after consumers migrate.
export type {
  ApiErrorCode,
  ApiError,
  ApiResponse,
  BusinessPublicView,
  PublicBookingPayload,
  ManageBookingInput,
  PublicSlotAvailabilityInput,
  PublicSlot,
  PublicBookingConfirmation,
  ManageBookingDetails,
  CancelBookingByTokenInput,
  RescheduleBookingByTokenInput,
  AdminManualBookingPayload,
  AdminBlockedTimePayload,
  AdminUpdateBookingPayload,
  AdminCancelBookingPayload,
  AdminRescheduleBookingPayload,
  AdminStatusUpdatePayload,
} from '@orvel/booking';
