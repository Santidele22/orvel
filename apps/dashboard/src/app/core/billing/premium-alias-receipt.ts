export const PREMIUM_TRANSFER_ALIAS = 'orvel.pagos';
export const PREMIUM_PRICE_COPY = '$25.000';
export const PREMIUM_WHATSAPP_NUMBER = '5492944667161';
export const PREMIUM_WHATSAPP_MESSAGE =
  'Hola, te mando el comprobante de Premium Orvel ($25.000). Alias orvel.pagos.';
export const PREMIUM_REVIEW_STORAGE_KEY = 'orvel.premium_review';
export const PREMIUM_REVIEW_PENDING = 'pending';
export const PREMIUM_RECEIPT_SENT_STORAGE_KEY = 'orvel.premium_review_receipt_sent';

type ReviewStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function buildPremiumWhatsAppUrl(message = PREMIUM_WHATSAPP_MESSAGE): string {
  return `https://wa.me/${PREMIUM_WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export async function copyPremiumAlias(clipboard?: Pick<Clipboard, 'writeText'>): Promise<boolean> {
  const target = clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined);
  if (!target?.writeText) {
    return false;
  }

  try {
    await target.writeText(PREMIUM_TRANSFER_ALIAS);
    return true;
  } catch {
    return false;
  }
}

export function markPremiumReviewPending(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(PREMIUM_REVIEW_STORAGE_KEY, PREMIUM_REVIEW_PENDING);
}

export function markPremiumReceiptSent(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(PREMIUM_RECEIPT_SENT_STORAGE_KEY, '1');
}

export function isPremiumReviewPending(storage: Pick<Storage, 'getItem'> | null | undefined): boolean {
  return storage?.getItem(PREMIUM_REVIEW_STORAGE_KEY) === PREMIUM_REVIEW_PENDING;
}

export function shouldShowPremiumReviewBanner(input: {
  pending: boolean;
  plan: unknown;
  premiumPaid: boolean;
}): boolean {
  if (!input.pending) {
    return false;
  }

  const plan = String(input.plan ?? '').trim().toUpperCase();
  if (plan === 'PREMIUM' && input.premiumPaid) {
    return false;
  }

  return true;
}

export function countCurrentMonthBookings(
  bookings: Array<{ id?: string; fecha: Date; estado?: string }>,
  now: Date,
): number {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth();
  const seen = new Set<string>();
  let count = 0;

  for (const booking of bookings) {
    const key = booking.id ?? booking.fecha.toISOString();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    if (booking.estado === 'cancelado' || booking.estado === 'no-asistio') {
      continue;
    }
    if (booking.fecha.getUTCFullYear() !== year || booking.fecha.getUTCMonth() !== month) {
      continue;
    }
    count += 1;
  }

  return count;
}

export function readBrowserReviewStorage(): ReviewStorage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.localStorage ?? null;
}
