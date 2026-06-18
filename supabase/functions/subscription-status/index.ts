import { createClient } from "@supabase/supabase-js";
import {
  getBillingCorsHeaders,
  rejectDisallowedBrowserOrigin,
  requireServerSecret,
} from "../_shared/billing-security.ts";

function json(
  body: unknown,
  status = 200,
  headers: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;
  if (req.method !== "GET") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405, corsHeaders);
  }

  const url = new URL(req.url);
  const subscriptionSessionId =
    url.searchParams.get("subscription_session_id")?.trim() ||
    url.searchParams.get("preapproval_id")?.trim();

  if (!subscriptionSessionId) {
    return json({ error: "missing_subscription_session" }, 400, corsHeaders);
  }

  const supabaseAdmin = createClient(
    requireServerSecret("SUPABASE_URL"),
    requireServerSecret("SUPABASE_SERVICE_ROLE_KEY"),
  );

  const { data: checkoutSession } = await supabaseAdmin
    .from("billing_checkout_sessions")
    .select("status, provider_resource_id, provider_preference_id")
    .eq("external_reference", subscriptionSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const providerSubscriptionId = checkoutSession?.provider_resource_id ||
    checkoutSession?.provider_preference_id || subscriptionSessionId;

  const { data: subscriptionByPreapproval } = await supabaseAdmin
    .from("business_subscriptions")
    .select("id, status")
    .eq("mp_preapproval_id", providerSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const subscription = subscriptionByPreapproval || (await supabaseAdmin
    .from("business_subscriptions")
    .select("id, status")
    .eq("provider_subscription_id", providerSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()).data;

  if (subscription) {
    return json(
      {
        subscription_session_id: subscriptionSessionId,
        status: subscription.status,
        materialized: true,
        account_materialized: true,
      },
      200,
      corsHeaders,
    );
  }

  const { data: accountFirstIntentByProvider } = await supabaseAdmin
    .from("account_first_intents")
    .select("status")
    .eq("provider_subscription_id", providerSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const accountFirstIntent = accountFirstIntentByProvider ||
    (await supabaseAdmin
      .from("account_first_intents")
      .select("status")
      .eq("external_reference", subscriptionSessionId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()).data;

  if (accountFirstIntent) {
    return json(
      {
        subscription_session_id: subscriptionSessionId,
        status: accountFirstIntent.status === "materialized"
          ? "active"
          : "pending",
        materialized: accountFirstIntent.status === "materialized",
        account_materialized: accountFirstIntent.status === "materialized",
      },
      200,
      corsHeaders,
    );
  }

  const { data: intentByProvider } = await supabaseAdmin
    .from("pending_signup_intents")
    .select("status")
    .eq("provider_subscription_id", providerSubscriptionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const intent = intentByProvider || (await supabaseAdmin
    .from("pending_signup_intents")
    .select("status")
    .eq("external_reference", subscriptionSessionId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()).data;

  return json(
    {
      subscription_session_id: subscriptionSessionId,
      status: intent?.status === "materialized" ? "active" : "pending",
      materialized: intent?.status === "materialized",
      account_materialized: intent?.status === "materialized",
    },
    200,
    corsHeaders,
  );
});
