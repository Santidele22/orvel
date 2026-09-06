import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import {
  PREMIUM_REVIEW_PENDING,
  PREMIUM_REVIEW_STORAGE_KEY,
  PREMIUM_TRANSFER_ALIAS,
  PREMIUM_WHATSAPP_NUMBER,
  buildPremiumWhatsAppUrl,
  copyPremiumAlias,
  markPremiumReviewPending,
} from '../lib/premium-alias-receipt';

const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);

function subscriptionSource(): string {
  return readFileSync(SUBSCRIPTION_PAGE, 'utf8');
}

describe('Premium alias + WhatsApp receipt (landing billing)', () => {
  it('does not mention Mercado Pago or redirect to init_point on the happy path', () => {
    const source = subscriptionSource();
    const markup = source.split('<script>')[0] ?? source;

    expect(markup).toContain('No usamos Mercado Pago ni tarjeta');
    expect(markup).not.toMatch(/Mercado Pago checkout/i);
    expect(source).not.toMatch(/init_point/);
    expect(source).not.toMatch(/\/api\/subscriptions\/start/);
    expect(source).not.toMatch(/window\.location\.href\s*=\s*result\.init_point/);
  });

  it('shows alias, WhatsApp, four steps, and the receipt CTA', () => {
    const source = subscriptionSource();

    expect(source).toContain('PASO FINAL');
    expect(source).toContain('Transferí y mandá el comprobante');
    expect(source).toContain('No usamos Mercado Pago ni tarjeta. Es una transferencia directa que validamos a mano.');
    expect(source).toMatch(/md:grid-cols-2/);
    expect(source).toContain('PLAN PREMIUM');
    expect(source).toContain('$25.000/mes');
    expect(source).toContain('Pago pendiente');
    expect(source).toContain('Turnos ilimitados');
    expect(source).toContain('1 local');
    expect(source).toContain('TRANSFERÍ A ESTE ALIAS');
    expect(source).toContain(PREMIUM_TRANSFER_ALIAS);
    expect(source).toContain('Copiar');
    expect(source).toContain('Transferí los $25.000 al alias de arriba.');
    expect(source).toContain('Mandá el comprobante por WhatsApp.');
    expect(source).toContain('Entrá ya en Gratis, sin esperar a nadie.');
    expect(source).toContain('Cuando lo validemos, pasás a Premium y te llega un mail.');
    expect(source).toContain('Enviar comprobante por WhatsApp');
    expect(source).toContain(`https://wa.me/${PREMIUM_WHATSAPP_NUMBER}`);
    expect(source).toContain('Hasta entonces tu cuenta funciona en plan Gratis.');
  });

  it('builds the WhatsApp URL with the short Spanish prefill', () => {
    expect(buildPremiumWhatsAppUrl()).toContain(`https://wa.me/${PREMIUM_WHATSAPP_NUMBER}?text=`);
    expect(decodeURIComponent(buildPremiumWhatsAppUrl())).toContain(
      'Hola, te mando el comprobante de Premium Orvel ($25.000). Alias orvel.pagos.',
    );
  });

  it('copies the alias and marks premium review as pending without changing plan', async () => {
    const writeText = vi.fn(async () => undefined);
    const storage = { setItem: vi.fn() };

    await expect(copyPremiumAlias({ writeText })).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(PREMIUM_TRANSFER_ALIAS);

    markPremiumReviewPending(storage);
    expect(storage.setItem).toHaveBeenCalledWith(PREMIUM_REVIEW_STORAGE_KEY, PREMIUM_REVIEW_PENDING);
  });
});
