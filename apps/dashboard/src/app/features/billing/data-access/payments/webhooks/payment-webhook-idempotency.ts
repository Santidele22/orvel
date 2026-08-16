import type { PaymentProvider } from '../../../../../core/payments/manual/payment-provider';

export type WebhookProcessingDecision = {
  shouldProcess: boolean;
  reason: 'FIRST_SEEN' | 'DUPLICATE_EVENT' | 'PAYLOAD_CHANGED_REPLAY';
  idempotencyKey: string;
};

export function buildProviderAgnosticIdempotencyKey(input: {
  provider: PaymentProvider;
  providerEventId: string;
}): string {
  return `${input.provider}:${input.providerEventId}`;
}

export function decideWebhookProcessing(input: {
  provider: PaymentProvider;
  providerEventId: string;
  incomingPayloadHash: string;
  existingPayloadHash: string | null;
}): WebhookProcessingDecision {
  const idempotencyKey = buildProviderAgnosticIdempotencyKey({
    provider: input.provider,
    providerEventId: input.providerEventId
  });

  if (input.existingPayloadHash === null) {
    return {
      shouldProcess: true,
      reason: 'FIRST_SEEN',
      idempotencyKey
    };
  }

  if (input.existingPayloadHash === input.incomingPayloadHash) {
    return {
      shouldProcess: false,
      reason: 'DUPLICATE_EVENT',
      idempotencyKey
    };
  }

  // Manual payments readiness note:
  // if the provider retries with the same provider_event_id but a changed payload hash,
  // we keep the decision deterministic and block side effects until manual reconciliation.
  return {
    shouldProcess: false,
    reason: 'PAYLOAD_CHANGED_REPLAY',
    idempotencyKey
  };
}
