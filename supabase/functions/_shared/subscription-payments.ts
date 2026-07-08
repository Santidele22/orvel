export interface SubscriptionPaymentInsertInput {
  subscriptionId: string;
  businessId: string;
  tenantId?: string | null;
  provider: string;
  providerPaymentId: string;
  providerSubscriptionId?: string | null;
  providerEventId: string;
  amount: number;
  currency: string;
  status: string;
  statusDetail?: string | null;
  paidAt?: string | null;
  processedAt: string;
  rawPayload?: unknown;
}

interface SubscriptionPaymentTable {
  upsert(
    row: ReturnType<typeof buildSubscriptionPaymentInsert>,
    options: { onConflict: string },
  ): PromiseLike<{ error: unknown | null }>;
}

export interface SubscriptionPaymentSupabaseClient {
  from(table: "subscription_payments"): SubscriptionPaymentTable;
}

export function buildSubscriptionPaymentInsert(
  input: SubscriptionPaymentInsertInput,
) {
  return {
    subscription_id: input.subscriptionId,
    business_id: input.businessId,
    tenant_id: input.tenantId ?? null,
    provider: input.provider,
    provider_payment_id: input.providerPaymentId,
    provider_subscription_id: input.providerSubscriptionId ?? null,
    provider_event_id: input.providerEventId,
    amount: input.amount,
    currency: input.currency,
    status: input.status,
    status_detail: input.statusDetail ?? null,
    paid_at: input.paidAt ?? null,
    processed_at: input.processedAt,
    raw_payload: input.rawPayload ?? null,
  };
}

export async function upsertSubscriptionPayment(
  supabase: SubscriptionPaymentSupabaseClient,
  input: SubscriptionPaymentInsertInput,
): Promise<{ error: unknown | null }> {
  return await supabase
    .from("subscription_payments")
    .upsert(
      buildSubscriptionPaymentInsert(input),
      { onConflict: "provider,provider_payment_id" },
    );
}
