// @orvel/booking/domain public surface barrel.
// Pure TS domain layer: zero Angular, zero RxJS observers, zero Supabase, zero fetch, zero DOM.

export type {
  CalendarEntryType,
  CalendarEntry,
  CreateAppointmentInput,
  RescheduleAppointmentInput,
} from './booking-core';
export {
  createAppointment,
  rescheduleAppointment,
  cancelAppointment,
  computePublicAvailability,
  canClientCancelOrReschedule,
  validateSelfServiceToken,
} from './booking-core';

export type { TimeWindow, ComputeAvailableSlotsInput } from './availability-core';
export { computeAvailableSlots } from './availability-core';

export { getPublicBookingOrigin, buildPublicBookingUrl } from './public-booking-url';
