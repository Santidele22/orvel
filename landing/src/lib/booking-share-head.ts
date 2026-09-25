import {
  isValidPublicBookingSlug,
  normalizePublicBookingSlug,
} from '../../../../packages/booking/src/public-booking-slug';
import { MARKETING_ORIGIN, OG_SHARE_URL } from './public-origin';

export type BookingShareHead = {
  title: string;
  description: string;
  canonicalUrl: string;
  robots: 'noindex, follow' | 'noindex';
  imageUrl: typeof OG_SHARE_URL;
};

export type BookingShareHeadInput = {
  slug: string;
  resolved: unknown;
  serviceNames: string[];
};

const GENERIC_TITLE = 'Orvel';
const GENERIC_DESCRIPTION = 'Reservá turno online con Orvel.';

function businessSlug(input: string): string {
  const trimmed = input.trim().replace(/^\/+/, '');
  const withoutPrefix = trimmed.startsWith('booking/') ? trimmed.slice('booking/'.length) : trimmed;
  return normalizePublicBookingSlug(withoutPrefix.split('/')[0] ?? '');
}

function resolvedName(resolved: unknown): string | null {
  if (!resolved || typeof resolved !== 'object') {
    return null;
  }
  const record = resolved as Record<string, unknown>;
  const name = record.name ?? record.displayName;
  if (typeof name !== 'string') {
    return null;
  }
  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function publicServiceNames(serviceNames: string[]): string[] {
  return serviceNames
    .filter((name): name is string => typeof name === 'string')
    .map((name) => name.trim())
    .filter((name) => name.length > 0 && !/\$|precio|ARS|USD/i.test(name))
    .slice(0, 3);
}

export function toBookingShareHead(input: BookingShareHeadInput): BookingShareHead {
  const slug = businessSlug(input.slug);
  const canonicalUrl = isValidPublicBookingSlug(slug)
    ? `${MARKETING_ORIGIN}/booking/${slug}`
    : `${MARKETING_ORIGIN}/booking`;
  const name = isValidPublicBookingSlug(slug) ? resolvedName(input.resolved) : null;

  if (!name) {
    return {
      title: GENERIC_TITLE,
      description: GENERIC_DESCRIPTION,
      canonicalUrl,
      robots: 'noindex',
      imageUrl: OG_SHARE_URL,
    };
  }

  const services = publicServiceNames(input.serviceNames);
  const description = services.length
    ? `${name}: reservá turno online. ${services.join(', ')}`
    : `${name}: reservá turno online.`;

  return {
    title: `${name} · Reservá turno | Orvel`,
    description,
    canonicalUrl,
    robots: 'noindex, follow',
    imageUrl: OG_SHARE_URL,
  };
}
