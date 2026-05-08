type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export function createWebhookAuditTrailRepository(deps: {
  clock: () => string;
  persistence: {
    insertWebhookEvent: (input: {
      provider: 'mercado_pago';
      providerEventId: string;
      payloadHash: string;
      signatureValidated: boolean;
      receivedAtIso: string;
    }) => Promise<{ webhookEventId: string }>;
    insertPaymentStateTransition: (input: {
      webhookEventId: string;
      provider: 'mercado_pago';
      providerPaymentId: string;
      externalReference: string;
      fromStatus: PaymentStatus;
      toStatus: PaymentStatus;
      transitionedAtIso: string;
    }) => Promise<{ transitionId: string }>;
  };
}) {
  return {
    recordWebhookAuditTrail: async (input: {
      providerEventId: string;
      payloadHash: string;
      signatureValidated: boolean;
      providerPaymentId: string;
      externalReference: string;
      fromStatus: PaymentStatus;
      toStatus: PaymentStatus;
    }) => {
      const nowIso = deps.clock();

      const webhookEvent = await deps.persistence.insertWebhookEvent({
        provider: 'mercado_pago',
        providerEventId: input.providerEventId,
        payloadHash: input.payloadHash,
        signatureValidated: input.signatureValidated,
        receivedAtIso: nowIso
      });

      const transition = await deps.persistence.insertPaymentStateTransition({
        webhookEventId: webhookEvent.webhookEventId,
        provider: 'mercado_pago',
        providerPaymentId: input.providerPaymentId,
        externalReference: input.externalReference,
        fromStatus: input.fromStatus,
        toStatus: input.toStatus,
        transitionedAtIso: nowIso
      });

      return {
        webhookEventId: webhookEvent.webhookEventId,
        transitionId: transition.transitionId
      };
    }
  };
}
