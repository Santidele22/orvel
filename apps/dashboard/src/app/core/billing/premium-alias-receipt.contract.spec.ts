import { describe, expect, it, vi } from 'vitest';

import { resolveAccountPlanPolicy } from '../accounts/account-plan-policy';
import {
  PREMIUM_RECEIPT_SENT_STORAGE_KEY,
  PREMIUM_REVIEW_PENDING,
  PREMIUM_REVIEW_STORAGE_KEY,
  PREMIUM_TRANSFER_ALIAS,
  PREMIUM_WHATSAPP_NUMBER,
  buildPremiumWhatsAppUrl,
  copyPremiumAlias,
  isPremiumReviewPending,
  markPremiumReceiptSent,
  markPremiumReviewPending,
  shouldShowPremiumReviewBanner,
} from './premium-alias-receipt';

describe('Premium alias receipt helpers', () => {
  it('builds WhatsApp wa.me with the Argentina number and Spanish prefill', () => {
    const url = buildPremiumWhatsAppUrl();
    expect(url).toContain(`https://wa.me/${PREMIUM_WHATSAPP_NUMBER}`);
    expect(decodeURIComponent(url)).toContain(
      'Hola, te mando el comprobante de Premium Orvel ($25.000). Alias orvel.pagos.',
    );
    expect(PREMIUM_TRANSFER_ALIAS).toBe('orvel.pagos');
  });

  it('copies the alias to the clipboard', async () => {
    const writeText = vi.fn(async () => undefined);
    await expect(copyPremiumAlias({ writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith('orvel.pagos');
  });

  it('stores pending review in localStorage without implying PREMIUM unpaid', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    };

    markPremiumReviewPending(storage);
    expect(storage.getItem(PREMIUM_REVIEW_STORAGE_KEY)).toBe(PREMIUM_REVIEW_PENDING);
    expect(isPremiumReviewPending(storage)).toBe(true);

    markPremiumReceiptSent(storage);
    expect(storage.getItem(PREMIUM_RECEIPT_SENT_STORAGE_KEY)).toBe('1');
    expect(isPremiumReviewPending(storage)).toBe(true);
  });

  it('shows the banner while pending on FREE and hides it when Premium is paid', () => {
    expect(shouldShowPremiumReviewBanner({ pending: true, plan: 'FREE', premiumPaid: false })).toBe(true);
    expect(shouldShowPremiumReviewBanner({ pending: true, plan: 'PREMIUM', premiumPaid: true })).toBe(false);
    expect(shouldShowPremiumReviewBanner({ pending: false, plan: 'FREE', premiumPaid: false })).toBe(false);
  });
});

describe('Account policy for pending Premium activation', () => {
  it('keeps FREE enabled and does not use unpaid PREMIUM as the pending path', () => {
    expect(resolveAccountPlanPolicy({ plan: 'FREE', premiumPaid: false }).accountEnabled).toBe(true);
    expect(resolveAccountPlanPolicy({ plan: 'PREMIUM', premiumPaid: false }).accountEnabled).toBe(false);
  });
});
