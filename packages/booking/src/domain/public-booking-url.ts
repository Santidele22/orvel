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

function isQaOrigin(origin: string): boolean {
  try {
    return new URL(origin).hostname === 'qa.orvel.pro';
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

export function getPublicBookingOrigin(currentOrigin = globalThis.location?.origin ?? ''): string {
  const normalizedCurrentOrigin = normalizeOrigin(currentOrigin.trim());

  if (normalizedCurrentOrigin && isLocalOrigin(normalizedCurrentOrigin)) {
    return toLocalPublicOrigin(normalizedCurrentOrigin);
  }

  if (normalizedCurrentOrigin && isQaOrigin(normalizedCurrentOrigin)) {
    return normalizedCurrentOrigin;
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
