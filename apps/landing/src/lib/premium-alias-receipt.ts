export const PREMIUM_TRANSFER_ALIAS = 'orvel.pagos';
export const PREMIUM_PRICE_COPY = '$25.000';
export const PREMIUM_WHATSAPP_NUMBER = '5492944667161';
export const PREMIUM_WHATSAPP_MESSAGE =
  'Hola, te mando el comprobante de Premium Orvel ($25.000). Alias orvel.pagos.';
export const PREMIUM_REVIEW_STORAGE_KEY = 'orvel.premium_review';
export const PREMIUM_REVIEW_PENDING = 'pending';

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
