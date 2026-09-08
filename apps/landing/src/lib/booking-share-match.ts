import { isValidPublicBookingSlug, normalizePublicBookingSlug } from '../../../../packages/booking/src/public-booking-slug';

const TENANT_PATH = /^\/booking\/(?!manage(?:\/|$))([^/]+)(?:\/[^/]+)?\/?$/;

export function isTenantBookingSharePath(pathname: string, search: string): boolean {
  const query = search.startsWith('?') ? search.slice(1) : search;
  if (new URLSearchParams(query).has('token')) {
    return false;
  }

  const match = TENANT_PATH.exec(pathname.split('?')[0] ?? '');
  if (!match?.[1]) {
    return false;
  }

  return isValidPublicBookingSlug(normalizePublicBookingSlug(match[1]));
}
