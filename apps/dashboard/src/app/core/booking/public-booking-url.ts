// Re-export shim: public-booking-url moved to @orvel/booking/domain (WU1).
// Keeps legacy importers green; delete after consumers migrate (WU7).
export { buildPublicBookingUrl, getPublicBookingOrigin } from '@orvel/booking/domain';
