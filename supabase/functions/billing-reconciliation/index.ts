import { createClient } from "@supabase/supabase-js";
import { requireServerSecret } from "../_shared/billing-security.ts";

type LocalSubscription = {
  business_id: string;
  tenant_id: string;
  plan_code: string;
  status: string;
  provider_subscription_id: string;
  provider_plan_id?: string | null;
  current_period_end?: string | null;
};

type RemotePreapproval = {
  id: string;
  status: string;
  preapproval_plan_id?: string;
  next_payment_date?: string;
  auto_recurring?: { end_date?: string };
};

function mapRemoteStatus(status: string): string {
  const normalized = status.toLowerCase();
  if (normalized === "authorized" || normalized === "approved") return "active";
  if (normalized === "cancelled" || normalized === "canceled") return "canceled";
  if (normalized === "paused") return "paused";
  if (normalized === "rejected") return "past_due";
  return normalized;
}

async function fetchMercadoPagoPreapproval(providerSubscriptionId: string): Promise<RemotePreapproval> {
  const accessToken = requireServerSecret("MP_ACCESS_TOKEN");
  const response = await fetch(`https://api.mercadopago.com/preapproval/${providerSubscriptionId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error(`Mercado Pago reconciliation fetch failed: ${response.status}`);
  }

  return response.json();
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), { status: 405, headers: { "Content-Type": "application/json" } });
  }

  const cronSecret = Deno.env.get("BILLING_RECONCILIATION_CRON_SECRET");
  if (cronSecret && req.headers.get("x-cron-secret") !== cronSecret) {
    return new Response(JSON.stringify({ error: "UNAUTHORIZED" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  const { tenant_id, dry_run = true } = await req.json().catch(() => ({}));
  if (!tenant_id) {
    return new Response(JSON.stringify({ error: "TENANT_ID_REQUIRED" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabase = createClient(requireServerSecret("SUPABASE_URL"), requireServerSecret("SUPABASE_SERVICE_ROLE_KEY"));
  const { data: localRows, error } = await supabase
    .from("business_subscriptions")
    .select("business_id,tenant_id,plan_code,status,provider_subscription_id,provider_plan_id,current_period_end")
    .eq("tenant_id", tenant_id)
    .eq("provider", "mercado_pago")
    .not("provider_subscription_id", "is", null);

  if (error) {
    return new Response(JSON.stringify({ error: "LOCAL_SUBSCRIPTIONS_READ_FAILED" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const actions = [];
  for (const local of (localRows ?? []) as LocalSubscription[]) {
    const remote = await fetchMercadoPagoPreapproval(local.provider_subscription_id);
    const remoteStatus = mapRemoteStatus(remote.status);
    const remotePeriodEnd = remote.next_payment_date || remote.auto_recurring?.end_date || null;

    if (local.status === "active" && remoteStatus === "canceled") {
      actions.push({ business_id: local.business_id, provider_subscription_id: local.provider_subscription_id, drift: "LOCAL_ACTIVE_REMOTE_CANCELLED", recommended_action: "CANCEL_LOCALLY" });
    } else if (local.status === "past_due" && remoteStatus === "active") {
      actions.push({ business_id: local.business_id, provider_subscription_id: local.provider_subscription_id, drift: "LOCAL_PAST_DUE_REMOTE_AUTHORIZED", recommended_action: "REACTIVATE_LOCALLY" });
    }

    if (remote.preapproval_plan_id && local.provider_plan_id && remote.preapproval_plan_id !== local.provider_plan_id) {
      actions.push({ business_id: local.business_id, provider_subscription_id: local.provider_subscription_id, drift: "PLAN_MISMATCH", recommended_action: "SYNC_PLAN" });
    }

    if (remotePeriodEnd && local.current_period_end && new Date(remotePeriodEnd).getTime() !== new Date(local.current_period_end).getTime()) {
      actions.push({ business_id: local.business_id, provider_subscription_id: local.provider_subscription_id, drift: "PERIOD_MISMATCH", recommended_action: "SYNC_PERIOD" });
    }
  }

  const result = { scanned: localRows?.length ?? 0, drift_count: actions.length, actions };
  await supabase.from("billing_reconciliation_runs").insert({ tenant_id, dry_run, scanned: result.scanned, drift_count: result.drift_count, actions });

  return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
});
