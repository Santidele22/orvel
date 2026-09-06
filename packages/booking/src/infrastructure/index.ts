// @orvel/booking/infrastructure public surface barrel.
// Infra layer: Supabase adapters + DI wiring. Angular DI is allowed HERE ONLY
// (SupabaseClient injection); no Angular components/templates/pwa.

export { SUPABASE_CLIENT } from './supabase/supabase-client.token';
export { createSupabaseClient } from './supabase/supabase-client.factory';
export { RealSupabaseBookingGateway } from './supabase/real-gateway';
export {
  ADMIN_BOOKING_REPOSITORY,
  SupabaseAdminBookingRepository
} from './supabase/admin-booking.repository';
export {
  BOOKING_QUERIES,
  SupabaseBookingQueries
} from './supabase/booking-queries.adapter';
export type {
  AdminAvailabilityRequest,
  AdminBookingRepository,
  AdminSlotAvailabilityRow
} from '../application/ports/admin-booking.repository';
export {
  setSupabaseBookingGateway,
  resolveBusinessBySlug,
  queryPublicSlotAvailability,
  createPublicBooking,
  manageBookingByToken,
  cancelBookingByToken,
  rescheduleBookingByToken,
  createAdminManualBooking,
  createAdminBlockedTime,
  updateAdminBooking,
  cancelAdminBooking,
  rescheduleAdminBooking,
  updateBookingStatus,
  confirmBookingDepositReceived
} from './supabase/api-wrapper';
