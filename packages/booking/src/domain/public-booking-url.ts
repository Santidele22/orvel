const CANONICAL_PUBLIC_BOOKING_ORIGIN = 'https://orvel.pro';

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

export function getPublicBookingOrigin(currentOrigin = globalThis.location?.origin ?? ''): string {
  const normalizedCurrentOrigin = normalizeOrigin(currentOrigin.trim());

  if (normalizedCurrentOrigin && (isLocalOrigin(normalizedCurrentOrigin) || isQaOrigin(normalizedCurrentOrigin))) {
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
