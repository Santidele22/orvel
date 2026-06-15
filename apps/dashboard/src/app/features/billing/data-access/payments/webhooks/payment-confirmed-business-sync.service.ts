type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
type ReconciledPaymentStatus = 'approved' | 'pending' | 'rejected' | 'cancelled';

export function createPaymentConfirmedBusinessSync(deps: {
  subscriptions: {
    upsertFromPayment: (input: {
      businessId: string;
      provider: 'mercado_pago';
      providerPaymentId: string;
      externalReference: string;
      planCode: PlanCode;
      status: 'active';
      nowIso: string;
    }) => Promise<{ applied: boolean; subscriptionId: string }>;
  };
  entitlements: {
    syncForBusiness: (input: {
      businessId: string;
      planCode: PlanCode;
      source: 'payment_webhook';
      sourceRef: string;
      nowIso: string;
    }) => Promise<{ synced: boolean; reason: 'APPLIED' | 'ALREADY_APPLIED' }>;
  };
}) {
  return {
    apply: async (input: {
      businessId: string;
      provider: 'mercado_pago';
      providerPaymentId: string;
      externalReference: string;
      reconciledStatus: ReconciledPaymentStatus;
      planCode: PlanCode;
      nowIso: string;
    }): Promise<{
      status: 200 | 202;
      data: {
        applied: boolean;
        reason: 'SYNCED' | 'ALREADY_SYNCED' | 'PAYMENT_NOT_APPROVED';
      };
    }> => {
      if (input.reconciledStatus !== 'approved') {
        return {
          status: 202,
          data: {
            applied: false,
            reason: 'PAYMENT_NOT_APPROVED'
          }
        };
      }

      const subscription = await deps.subscriptions.upsertFromPayment({
        businessId: input.businessId,
        provider: input.provider,
        providerPaymentId: input.providerPaymentId,
        externalReference: input.externalReference,
        planCode: input.planCode,
        status: 'active',
        nowIso: input.nowIso
      });

      if (!subscription.applied) {
        return {
          status: 200,
          data: {
            applied: false,
            reason: 'ALREADY_SYNCED'
          }
        };
      }

      const entitlementSync = await deps.entitlements.syncForBusiness({
        businessId: input.businessId,
        planCode: input.planCode,
        source: 'payment_webhook',
        sourceRef: `${input.provider}:${input.providerPaymentId}`,
        nowIso: input.nowIso
      });

      return {
        status: 200,
        data: {
          applied: subscription.applied,
          reason: entitlementSync.reason === 'APPLIED' ? 'SYNCED' : 'ALREADY_SYNCED'
        }
      };
    }
  };
}
