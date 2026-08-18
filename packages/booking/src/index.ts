// @orvel/booking public surface barrel.
// Second of 7 planned extractions; see packages/booking/README.md.

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
} from './types';

export type { SupabaseBookingGateway } from './gateway-interface';
export type { AvailabilityWindow, BookingCounts, BookingQueries } from './application/ports/booking-queries';
export { utcDayRange } from './application/ports/booking-queries';

export { normalizePublicBookingSlug, isValidPublicBookingSlug } from './public-booking-slug';

// Domain layer (WU1 of hexagonal pilot; see packages/booking/README.md).
export * from './domain';
