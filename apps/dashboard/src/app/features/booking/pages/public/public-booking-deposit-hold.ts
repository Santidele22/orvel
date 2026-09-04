export const DEPOSIT_HOLD_RELEASE_COPY = 'Si no se confirma la seña, el horario se libera.';

export function computeServiceDepositHoldAmount(price: number, percent: number): number {
  if (!percent) {
    return 0;
  }
  return Math.round((Number(price) * Number(percent)) / 100);
}

export function formatServiceDepositPreview(price: number, percent: number): string | null {
  if (!percent) {
    return null;
  }
  return `Seña ${percent}% · ${formatDepositMoney(computeServiceDepositHoldAmount(price, percent))}`;
}

export function formatDepositMoney(amount: number): string {
  return `$${Math.round(Number(amount) || 0).toLocaleString('es-AR')}`;
}

export type ServiceDepositQuote = {
  serviceName: string;
  servicePrice: number;
  percent: number;
  holdAmount: number;
  remainderAmount: number;
};

export function buildServiceDepositQuote(
  serviceName: string,
  price: number,
  percent: number
): ServiceDepositQuote | null {
  if (![25, 50, 100].includes(Number(percent))) {
    return null;
  }

  const servicePrice = Math.round(Number(price) || 0);
  const holdAmount = computeServiceDepositHoldAmount(servicePrice, percent);
  return {
    serviceName,
    servicePrice,
    percent: Number(percent),
    holdAmount,
    remainderAmount: Math.max(0, servicePrice - holdAmount)
  };
}

export function formatBusinessDepositRequiredBanner(percent: number): string | null {
  if (![25, 50, 100].includes(Number(percent))) {
    return null;
  }
  return `Este negocio pide seña del ${percent}% para reservar.`;
}

export type PublicDepositHoldView = {
  code: string;
  amountPesos: number;
  alias: string | null;
  cbu: string | null;
  expiresAtIso: string;
  message: string;
  manageToken?: string;
};

export type PublicDepositHoldSource = {
  depositCode?: string | null;
  depositAmount?: number | string | null;
  depositAlias?: string | null;
  depositCbu?: string | null;
  depositHoldExpiresAt?: string | null;
  depositHoldMessage?: string | null;
  manageToken?: string | null;
  bookingId?: string;
  status?: string;
} | null | undefined;

export function readPublicDepositHold(data: PublicDepositHoldSource): PublicDepositHoldView | null {
  if (!data) {
    return null;
  }

  const code = data.depositCode?.trim();
  if (!code) {
    return null;
  }

  const amount = Number(data.depositAmount);
  const hold: PublicDepositHoldView = {
    code,
    amountPesos: Number.isFinite(amount) ? amount : 0,
    alias: data.depositAlias?.trim() || null,
    cbu: data.depositCbu?.trim() || null,
    expiresAtIso: data.depositHoldExpiresAt?.trim() || '',
    message: data.depositHoldMessage?.trim() || DEPOSIT_HOLD_RELEASE_COPY
  };

  const manageToken = data.manageToken?.trim();
  if (manageToken) {
    hold.manageToken = manageToken;
  }

  return hold;
}

export function formatDepositHoldExpiry(iso: string, nowMs = Date.now()): string {
  const expires = new Date(iso);
  if (Number.isNaN(expires.getTime())) {
    return iso;
  }

  const formatted = new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(expires);
  const remainingMinutes = Math.max(0, Math.ceil((expires.getTime() - nowMs) / 60000));
  return `${formatted} (quedan ${remainingMinutes} min)`;
}

export function buildSeñaReceiptWhatsAppUrl(
  phone: string | null | undefined,
  details?: { code?: string | null; amountPesos?: number | null }
): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (digits.length < 8) {
    return null;
  }

  let international = digits;
  if (!international.startsWith('54')) {
    international = `54${international.replace(/^0/, '')}`;
  }

  const parts = ['Hola, te mando el comprobante de la seña'];
  if (details?.code) {
    parts.push(details.code);
  }
  if (details?.amountPesos) {
    parts.push(`($${Math.round(details.amountPesos)})`);
  }

  return `https://wa.me/${international}?text=${encodeURIComponent(`${parts.join(' ')}.`)}`;
}
