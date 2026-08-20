import { getOfferForPosition, type ValidWaitlist, type WaitlistOffer } from './waitlist';

export type WaitlistSheetEntry = Pick<
  ValidWaitlist,
  'name' | 'email' | 'whatsapp' | 'normalizedWhatsapp' | 'rubro'
> & {
  createdAt?: string;
};

export type WaitlistSheetConfig = {
  webhookUrl?: string | null;
  secret?: string | null;
};

export type WaitlistSheetAppendResult =
  | { ok: true; offer: WaitlistOffer | null }
  | { ok: false; reason: 'persistence_unavailable' | 'already_exists'; offer?: WaitlistOffer | null };

type WaitlistFetch = (input: string, init?: RequestInit) => Promise<Response>;

function readStatus(body: unknown): string | undefined {
  if (!body || typeof body !== 'object' || !('status' in body)) return undefined;
  const status = (body as { status?: unknown }).status;
  return typeof status === 'string' ? status : undefined;
}

function readPosition(body: unknown): number | null {
  if (!body || typeof body !== 'object' || !('position' in body)) return null;
  const position = Number((body as { position?: unknown }).position);
  if (!Number.isFinite(position) || position < 1) return null;
  return Math.floor(position);
}

function offerFromBody(body: unknown): WaitlistOffer | null {
  const position = readPosition(body);
  return position ? getOfferForPosition(position) : null;
}

export async function appendWaitlistToSheet(
  entry: WaitlistSheetEntry,
  config: WaitlistSheetConfig,
  fetchImpl: WaitlistFetch = fetch
): Promise<WaitlistSheetAppendResult> {
  const webhookUrl = config.webhookUrl?.trim();
  const secret = config.secret?.trim();
  if (!webhookUrl || !secret) {
    return { ok: false, reason: 'persistence_unavailable' };
  }

  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret,
        name: entry.name,
        email: entry.email,
        whatsapp: entry.whatsapp,
        normalizedWhatsapp: entry.normalizedWhatsapp,
        rubro: entry.rubro,
        createdAt: entry.createdAt ?? new Date().toISOString()
      })
    });

    if (!response.ok) {
      return { ok: false, reason: 'persistence_unavailable' };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'persistence_unavailable' };
    }

    const status = readStatus(body);
    if (status === 'ok') return { ok: true, offer: offerFromBody(body) };
    if (status === 'duplicate') {
      return { ok: false, reason: 'already_exists', offer: offerFromBody(body) };
    }
    return { ok: false, reason: 'persistence_unavailable' };
  } catch {
    return { ok: false, reason: 'persistence_unavailable' };
  }
}

export async function fetchWaitlistOccupied(
  config: WaitlistSheetConfig,
  fetchImpl: WaitlistFetch = fetch
): Promise<number | null> {
  const webhookUrl = config.webhookUrl?.trim();
  const secret = config.secret?.trim();
  if (!webhookUrl || !secret) return null;

  try {
    const response = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, action: 'occupied' })
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    if (!body || typeof body !== 'object' || !('occupied' in body)) return null;
    const occupied = Number((body as { occupied?: unknown }).occupied);
    if (!Number.isFinite(occupied) || occupied < 0) return null;
    return Math.floor(occupied);
  } catch {
    return null;
  }
}
