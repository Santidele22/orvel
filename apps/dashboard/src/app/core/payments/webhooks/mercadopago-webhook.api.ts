import { createMercadoPagoWebhookHandler } from '../../../features/billing/data-access/payments/webhooks/mercadopago-webhook-security.api';

export { createMercadoPagoWebhookHandler } from '../../../features/billing/data-access/payments/webhooks/mercadopago-webhook-security.api';

const defaultHandler = createMercadoPagoWebhookHandler({
  signatureVerifier: {
    verify: () => false
  },
  paymentsApiAdapter: {
    getPaymentById: async () => ({
      paymentId: '',
      status: 'pending',
      externalReference: ''
    })
  },
  stateTransitions: {
    applyPaymentTransition: async () => ({ applied: false, transitionId: '' })
  },
  idempotency: {
    registerIfFirstSeen: async () => ({ shouldProcess: false, dedupeKey: '' })
  },
  logger: {
    warn: () => undefined
  }
});

export function handleMercadoPagoWebhook(input: {
  headers: Record<string, string>;
  rawBody: string;
  nowIso: string;
}) {
  return defaultHandler.handle(input);
}
