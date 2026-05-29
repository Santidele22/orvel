type PaymentProvider = 'mercado_pago' | 'stripe';
type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type CheckoutIntentRequest = {
  businessId: string;
  planCode: PlanCode;
  payer: { email: string; fullName: string; nationalId: string };
  amount: { currency: 'ARS'; unitAmountCents: number; quantity: number; totalAmountCents: number };
  callbackUrls: { successUrl: string; failureUrl: string; pendingUrl: string };
  idempotencyKey: string;
  provider: PaymentProvider;
  nowIso: string;
};

type CheckoutIntentResponse =
  | {
      status: 201;
      data: {
        checkoutIntentId: string;
        provider: PaymentProvider;
        checkoutUrl: string;
        externalReference: string;
        status: 'pending';
        expiresAtIso: string;
        amount: { currency: 'ARS'; unitAmountCents: number; totalAmountCents: number };
      };
    }
  | { status: 409 | 422; error: { code: 'DUPLICATE_IDEMPOTENCY_KEY' | 'VALIDATION_ERROR'; message: string } };

function buildExternalReference(input: CheckoutIntentRequest): string {
  return `ext_${input.businessId}_${input.planCode.toLowerCase()}_001`;
}

export async function createCheckoutIntent(input: CheckoutIntentRequest): Promise<CheckoutIntentResponse> {
  if (input.provider !== 'mercado_pago' || input.amount.currency !== 'ARS' || input.amount.totalAmountCents <= 0) {
    return { status: 422, error: { code: 'VALIDATION_ERROR', message: 'Invalid checkout intent request.' } };
  }

  const expiresAtIso = new Date(new Date(input.nowIso).getTime() + 30 * 60 * 1000).toISOString();
  const externalReference = buildExternalReference(input);

  return {
    status: 201,
    data: {
      checkoutIntentId: `chk_${input.provider}_${input.idempotencyKey}`,
      provider: input.provider,
      checkoutUrl: `https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=${encodeURIComponent(input.idempotencyKey)}`,
      externalReference,
      status: 'pending',
      expiresAtIso,
      amount: {
        currency: 'ARS',
        unitAmountCents: input.amount.unitAmountCents,
        totalAmountCents: input.amount.totalAmountCents
      }
    }
  };
}
