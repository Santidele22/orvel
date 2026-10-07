const CANONICAL_PUBLIC_BOOKING_ORIGIN = 'https://orvel.pro';
const LOCAL_PROXY_PORT = '3000';
const LOCAL_APP_PORTS = new Set(['4200', '4321']);

function normalizeOrigin(origin: string): string {
  return origin.replace(/\/$/, '');
}

function isLocalOrigin(origin: string): boolean {
  try {
    const { hostname } = new URL(origin);
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0';
  } catch {
    return false;
  }
}

function toLocalPublicOrigin(origin: string): string {
  const url = new URL(origin);
  if (LOCAL_APP_PORTS.has(url.port)) {
    url.port = LOCAL_PROXY_PORT;
  }
  return normalizeOrigin(url.origin);
}

/**
 * The public booking origin. `main` is the only deployed environment (#1133), so outside local
 * development every booking link points at the canonical production origin; there is no pre-release
 * origin to special-case any more.
 */
export function getPublicBookingOrigin(currentOrigin = globalThis.location?.origin ?? ''): string {
  const normalizedCurrentOrigin = normalizeOrigin(currentOrigin.trim());

  if (normalizedCurrentOrigin && isLocalOrigin(normalizedCurrentOrigin)) {
    return toLocalPublicOrigin(normalizedCurrentOrigin);
  }

  return CANONICAL_PUBLIC_BOOKING_ORIGIN;
}

export function buildPublicBookingUrl(slug: string, currentOrigin?: string, professionalSlug?: string): string {
  const origin = getPublicBookingOrigin(currentOrigin);
  const professional = professionalSlug?.trim();
  if (professional) {
    return `${origin}/booking/${encodeURIComponent(slug)}/${encodeURIComponent(professional)}`;
  }
  return `${origin}/booking/${encodeURIComponent(slug)}`;
}
