const SLUG_SEPARATOR_PATTERN = /[^a-z0-9]+/g;
const SLUG_EDGE_SEPARATOR_PATTERN = /^-+|-+$/g;

export function normalizePublicBookingSlug(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(SLUG_SEPARATOR_PATTERN, '-')
    .replace(SLUG_EDGE_SEPARATOR_PATTERN, '');
}

export function isValidPublicBookingSlug(input: string): boolean {
  const normalized = normalizePublicBookingSlug(input);
  return normalized.length > 0 && normalized.length <= 120 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(normalized);
}
