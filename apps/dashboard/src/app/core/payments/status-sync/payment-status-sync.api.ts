type PaymentProvider = 'mercado_pago' | 'stripe';
type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type PaymentStatusSyncInput = {
  businessId: string;
  provider: PaymentProvider;
  providerPaymentId: string;
  externalReference: string;
  expectedPlanCode: PlanCode;
  nowIso: string;
};

type PaymentStatusSyncResponse =
  | {
      status: 200 | 202;
      data: {
        provider: PaymentProvider;
        providerPaymentId: string;
        reconciledStatus: 'approved' | 'pending' | 'rejected' | 'cancelled';
        externalReference: string;
        entitlementUpdate: {
          applied: boolean;
          reason: 'APPLIED' | 'ALREADY_APPLIED' | 'PAYMENT_NOT_APPROVED';
          idempotencyKey: string;
          planCode?: PlanCode;
        };
      };
    }
  | { status: 404; error: { code: 'PAYMENT_NOT_FOUND'; message: string } };

const appliedEntitlements = new Set<string>();

export async function syncPaymentStatus(input: PaymentStatusSyncInput): Promise<PaymentStatusSyncResponse> {
  if (input.provider !== 'mercado_pago' || !input.providerPaymentId) {
    return { status: 404, error: { code: 'PAYMENT_NOT_FOUND', message: 'Payment was not found.' } };
  }

  const idempotencyKey = `entitlement:${input.provider}:${input.providerPaymentId}:${input.expectedPlanCode}`;
  const alreadyApplied = appliedEntitlements.has(idempotencyKey);
  appliedEntitlements.add(idempotencyKey);

  return {
    status: 200,
    data: {
      provider: input.provider,
      providerPaymentId: input.providerPaymentId,
      reconciledStatus: 'approved',
      externalReference: input.externalReference,
      entitlementUpdate: {
        applied: !alreadyApplied,
        reason: alreadyApplied ? 'ALREADY_APPLIED' : 'APPLIED',
        idempotencyKey,
        planCode: input.expectedPlanCode
      }
    }
  };
}
