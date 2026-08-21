// Re-export shim for the @orvel/booking migration window.
// The slug helpers live in @orvel/booking. Kept for migration; delete after consumers migrate.
export { normalizePublicBookingSlug, isValidPublicBookingSlug } from '@orvel/booking';
