// @orvel/booking/domain public surface barrel.
// Pure TS domain layer: zero Angular, zero RxJS observers, zero Supabase, zero fetch, zero DOM.

export type {
  CalendarEntryType,
  CalendarEntry,
  CreateAppointmentInput,
} from './booking-core';
export {
  createAppointment,
  computePublicAvailability,
  canClientCancelOrReschedule,
  validateSelfServiceToken,
} from './booking-core';
