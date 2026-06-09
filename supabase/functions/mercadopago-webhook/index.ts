// mercadopago-webhook Edge Function
// Handles Mercado Pago webhook notifications for subscription status updates
// Endpoint: POST /functions/v1/mercadopago-webhook

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret, verifyMercadoPagoWebhookSignature } from "../_shared/billing-security.ts";
import { recordWebhookProcessMetric } from "../_shared/mp-rollout-observability.ts";
import { mapWebhookStatusToSubscriptionStatus } from "../_shared/mp-subscription-guards.ts";
import { parseBillingSessionReference } from "../_shared/mp-subscription-session-reference.ts";

const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitStore = new Map<string, number[]>();

function getClientIp(req: Request): string {
  return (
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("client-ip") ||
    "unknown"
  );
}

function isRateLimited(req: Request): boolean {
  const now = Date.now();
  const ip = getClientIp(req);
  const recent = (rateLimitStore.get(ip) || []).filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS);

  if (recent.length >= RATE_LIMIT_MAX_REQUESTS) {
    rateLimitStore.set(ip, recent);
    return true;
  }

  recent.push(now);
  rateLimitStore.set(ip, recent);
  return false;
}

// Mercado Pago API URLs
const MP_API_BASE = "https://api.mercadopago.com";


interface WebhookPayload {
  id?: string;
  type: string;
  action: string;
  data: {
    id: string;
  };
  external_reference?: string;
}

interface MpVerificationFailure {
  retryable: boolean;
  reason: string;
}

// SHA256 hash function for payload verification
async function sha256(message: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message + secret);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function syncEntitlementsForBusiness(
  supabaseAdmin: SupabaseClient<any, "public", any>,
  businessId: string,
  tenantId: string
): Promise<void> {
  const { error } = await supabaseAdmin.rpc("get_business_entitlements_snapshot", {
    p_business_id: businessId,
    p_tenant_id: tenantId,
  });

  if (error) {
    console.error("Error syncing plan entitlements:", error);
  } else {
    console.log("Entitlements synced for business:", businessId);
  }
}

// Verify payment status with MP API (server-truth)
async function verifyPaymentStatus(paymentId: string): Promise<{
  status: string;
  status_detail: string;
  amount: number;
  currency: string;
  external_reference?: string;
  metadata?: Record<string, unknown>;
  date_approved?: string;
} | MpVerificationFailure> {
  const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
  if (!mpAccessToken) {
    console.error("MP_ACCESS_TOKEN not configured");
    return { retryable: true, reason: "mp_access_token_missing" };
  }

  try {
    const response = await fetch(
      `${MP_API_BASE}/v1/payments/${paymentId}`,
      {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error("MP API returned:", response.status);
      return { retryable: response.status >= 500 || response.status === 429, reason: `mp_payment_lookup_http_${response.status}` };
    }

    const data = await response.json();
    return {
      status: data.status,
      status_detail: data.status_detail,
      amount: data.transaction_amount || data.amount,
      currency: data.currency_id || "ARS",
      external_reference: data.external_reference,
      metadata: data.metadata,
      date_approved: data.date_approved,
    };
  } catch (error) {
    console.error("Error verifying payment with MP:", error);
    return { retryable: true, reason: "mp_payment_lookup_network_error" };
  }
}

// Verify preapproval status with MP API
async function verifyPreapprovalStatus(preapprovalId: string): Promise<{
  status: string;
  external_reference?: string;
  reason?: string;
  auto_recurring?: { transaction_amount?: number; currency_id?: string; start_date?: string; end_date?: string };
  preapproval_plan_id?: string;
  next_payment_date?: string;
  date_created?: string;
} | MpVerificationFailure> {
  const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
  if (!mpAccessToken) {
    return { retryable: true, reason: "mp_access_token_missing" };
  }

  try {
    const response = await fetch(
      `${MP_API_BASE}/preapproval/${preapprovalId}`,
      {
        headers: {
          Authorization: `Bearer ${mpAccessToken}`,
        },
      }
    );

    if (!response.ok) {
      return { retryable: response.status >= 500 || response.status === 429, reason: `mp_preapproval_lookup_http_${response.status}` };
    }

    const data = await response.json();
    return {
      status: data.status,
      external_reference: data.external_reference,
      reason: data.reason,
      auto_recurring: data.auto_recurring,
      preapproval_plan_id: data.preapproval_plan_id,
      next_payment_date: data.next_payment_date,
      date_created: data.date_created,
    };
  } catch (error) {
    console.error("Error verifying preapproval with MP:", error);
    return { retryable: true, reason: "mp_preapproval_lookup_network_error" };
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);
  const requestStartedAt = Date.now();

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  if (isRateLimited(req)) {
    return new Response(
      JSON.stringify({ error: "RATE_LIMIT_EXCEEDED", message: "Too many requests" }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      }
    );
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "METHOD_NOT_ALLOWED", message: "Solo POST permitido" }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // =============================================================================
    // 1. VERIFY SIGNATURE (always enforced)
    // =============================================================================
    const body = await req.text();
    if (!Deno.env.get("MP_WEBHOOK_SECRET")?.trim()) {
      return new Response(
        JSON.stringify({ error: "SERVER_CONFIG_ERROR", message: "MP_WEBHOOK_SECRET not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isValid = await verifyMercadoPagoWebhookSignature(req, body);
    if (!isValid) {
      console.log("Invalid signature");
      return new Response(
        JSON.stringify({ error: "INVALID_SIGNATURE", message: "Firma inválida" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse webhook payload
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: "INVALID_JSON", message: "Payload inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Received Mercado Pago webhook", {
      type: payload.type,
      action: payload.action,
      resource_id: payload.data?.id,
      provider_event_id: payload.id,
    });

    // =============================================================================
    // 2. EXTRACT EVENT INFO
    // =============================================================================
    const eventType = payload.type;
    const eventAction = payload.action;
    const resourceId = payload.data?.id;

    // Map to provider event ID
    const provider = "mercado_pago";
    const requestId = req.headers.get("x-request-id") || req.headers.get("x-idempotency-key");
    const providerEventId = payload.id || requestId || `${eventType}:${eventAction}:${resourceId}`;
    const signatureHeader = req.headers.get("x-signature") || "";
    const signatureParts = Object.fromEntries(signatureHeader.split(",").map((part) => part.split("=").map((entry) => entry.trim())).filter((part) => part.length === 2));
    const signatureTs = Number(signatureParts.ts || 0);
    const signatureV1 = signatureParts.v1 || "";

    if (!resourceId) {
      return new Response(
        JSON.stringify({ error: "NO_RESOURCE_ID", message: "ID de recurso no proporcionado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!requestId || !Number.isFinite(signatureTs) || !signatureV1) {
      return new Response(
        JSON.stringify({ error: "INVALID_WEBHOOK_HEADERS", message: "Missing x-request-id or signature metadata" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 3. IDEMPOTENCY CHECK
    // =============================================================================
    const supabaseUrl = requireServerSecret("SUPABASE_URL");
    const supabaseKey = requireServerSecret("SUPABASE_SERVICE_ROLE_KEY");

    const supabaseAdmin = createClient(supabaseUrl, supabaseKey);

    const payloadHash = await sha256(body, "");

    const { data: existingEvent } = await supabaseAdmin
      .from("payment_webhook_events")
      .select("id, processed_at, payload_hash")
      .eq("provider", provider)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (existingEvent?.processed_at && existingEvent.payload_hash === payloadHash) {
      recordWebhookProcessMetric({
        providerEventId,
        result: "duplicate",
        retryable: false,
        idempotencyDecision: "duplicate_processed",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 200,
      });
      return new Response(
        JSON.stringify({ success: true, message: "Evento ya procesado", event_id: existingEvent.id }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (existingEvent && existingEvent.payload_hash && existingEvent.payload_hash !== payloadHash) {
      await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_state: "failed",
        p_failure_reason: "payload_conflict",
      });

      recordWebhookProcessMetric({
        providerEventId,
        result: "error",
        retryable: false,
        idempotencyDecision: "payload_conflict",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 409,
      });
      return new Response(
        JSON.stringify({ error: "IDEMPOTENCY_PAYLOAD_MISMATCH", message: "Payload conflict for existing provider_event_id" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin
      .from("payment_webhook_events")
      .upsert({
        provider,
        provider_event_id: providerEventId,
        payload_hash: payloadHash,
        status: "received",
      }, { onConflict: "provider,provider_event_id" });

    await supabaseAdmin
      .from("mp_webhook_events")
      .upsert({
        provider,
        provider_event_id: providerEventId,
        event_type: eventType,
        action: eventAction,
        resource_id: resourceId,
        request_id: requestId,
        payload_hash: payloadHash,
        payload,
        signature_valid: true,
        processing_state: "reserved",
      }, { onConflict: "provider,provider_event_id" });

    const { data: reservation, error: reservationError } = await supabaseAdmin.rpc("reserve_payment_webhook_event", {
      p_provider: provider,
      p_provider_event_id: providerEventId,
      p_request_id: requestId,
      p_signature_ts: signatureTs,
      p_signature_v1: signatureV1,
      p_resource_id: resourceId,
      p_action: eventAction,
      p_payload_hash: payloadHash,
      p_replay_window_seconds: 300,
    });

    if (reservationError) {
      console.error("Error reserving webhook event:", reservationError.message);
      return new Response(
        JSON.stringify({ error: "IDEMPOTENCY_WRITE_FAILED", message: "Could not persist webhook event idempotency" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const reservationDecision = Array.isArray(reservation) ? reservation[0]?.decision : reservation?.decision;
    const reservedEventId = Array.isArray(reservation) ? reservation[0]?.event_id : reservation?.event_id;

    if (reservationDecision === "payload_conflict") {
      await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_state: "failed",
        p_failure_reason: "payload_conflict",
      });

      recordWebhookProcessMetric({
        providerEventId,
        result: "error",
        retryable: false,
        idempotencyDecision: "payload_conflict",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 409,
      });
      return new Response(
        JSON.stringify({ error: "IDEMPOTENCY_PAYLOAD_MISMATCH", message: "Payload conflict for existing provider_event_id" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (reservationDecision === "duplicate_processed") {
      console.log("Event already processed:", providerEventId);
      recordWebhookProcessMetric({
        providerEventId,
        result: "duplicate",
        retryable: false,
        idempotencyDecision: "duplicate_processed",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 200,
      });
      return new Response(
        JSON.stringify({ success: true, message: "Evento ya procesado", event_id: reservedEventId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!["reserved", "retry"].includes(String(reservationDecision))) {
      await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_state: "failed",
        p_failure_reason: `unexpected_reservation_decision:${String(reservationDecision || "unknown")}`,
      });

      return new Response(
        JSON.stringify({ error: "IDEMPOTENCY_RESERVATION_INVALID", message: "Unexpected idempotency reservation decision" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
      p_provider: provider,
      p_provider_event_id: providerEventId,
      p_state: "processing",
      p_failure_reason: null,
    });

    // =============================================================================
    // 4. SERVER-TRUTH: VERIFY WITH MP API
    // =============================================================================
    let mpVerifiedStatus: string | null = null;
    let mpStatusDetail: string | null = null;
    let amount: number = 0;
    let currency: string = "ARS";
    let externalReference = payload.external_reference;
    let verifiedMetadata: Record<string, unknown> | undefined;
    let currentPeriodStart: string | null = null;
    let currentPeriodEnd: string | null = null;
    let providerPlanId: string | null = null;
    let verificationFailure: MpVerificationFailure | null = null;

    // Determine if it's a payment or preapproval event
    if (eventType === "payment") {
      const verified = await verifyPaymentStatus(resourceId);
      if ("status" in verified) {
        mpVerifiedStatus = verified.status;
        mpStatusDetail = verified.status_detail;
        amount = verified.amount;
        currency = verified.currency;
        externalReference = verified.external_reference || externalReference;
        verifiedMetadata = verified.metadata;
        currentPeriodStart = verified.date_approved || null;
      } else {
        verificationFailure = verified;
      }
    } else if (eventType === "preapproval" || eventType === "subscription_preapproval") {
      const verified = await verifyPreapprovalStatus(resourceId);
      if ("status" in verified) {
        mpVerifiedStatus = verified.status;
        externalReference = verified.external_reference || externalReference;
        amount = Number(verified.auto_recurring?.transaction_amount || amount);
        currency = verified.auto_recurring?.currency_id || currency;
        providerPlanId = verified.preapproval_plan_id || null;
        currentPeriodStart = verified.auto_recurring?.start_date || verified.date_created || null;
        currentPeriodEnd = verified.next_payment_date || verified.auto_recurring?.end_date || null;
      } else {
        verificationFailure = verified;
      }
    }

    if (!mpVerifiedStatus) {
      const failureReason = verificationFailure?.reason || "mp_server_truth_unverified";
      await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_state: "failed",
        p_failure_reason: failureReason,
      });

      recordWebhookProcessMetric({
        providerEventId,
        result: "error",
        retryable: verificationFailure?.retryable ?? true,
        idempotencyDecision: "first_seen",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: verificationFailure?.retryable === false ? 422 : 503,
      });
      return new Response(
        JSON.stringify({
          error: "MP_VERIFICATION_UNAVAILABLE",
          message: "No se pudo verificar el estado con Mercado Pago; evento marcado para reintento",
          retryable: verificationFailure?.retryable ?? true,
        }),
        {
          status: verificationFailure?.retryable === false ? 422 : 503,
          headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "30" },
        }
      );
    }

    const internalStatus = mapWebhookStatusToSubscriptionStatus(eventType, mpVerifiedStatus);

    // =============================================================================
    // 5. FIND AND UPDATE SUBSCRIPTION
    // =============================================================================
    // Try to find subscription by MP preapproval_id or provider_subscription_id
    let subscription: { id: string; business_id: string; tenant_id: string; plan_code: string; provider_subscription_id?: string; provider_plan_id?: string } | null = null;
    const lookupResourceId = String(verifiedMetadata?.provider_subscription_id || verifiedMetadata?.preapproval_id || resourceId);

    // First try: find by mp_preapproval_id
    const { data: subByPreapproval } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, business_id, tenant_id, plan_code, provider_subscription_id, provider_plan_id")
      .eq("mp_preapproval_id", lookupResourceId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (subByPreapproval) {
      subscription = subByPreapproval;
    } else {
      // Second try: find by provider_subscription_id
      const { data: subByProvider } = await supabaseAdmin
        .from("business_subscriptions")
        .select("id, business_id, tenant_id, plan_code, provider_subscription_id, provider_plan_id")
        .eq("provider_subscription_id", lookupResourceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (subByProvider) {
        subscription = subByProvider;
      }
    }

    // =============================================================================
    // 6. UPDATE BUSINESS SUBSCRIPTION
    // =============================================================================
    if (subscription) {
      const billingSessionReference = parseBillingSessionReference(externalReference);
      if (!billingSessionReference) {
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", { p_provider: provider, p_provider_event_id: providerEventId, p_state: "failed", p_failure_reason: "invalid_external_reference" });
        return new Response(
          JSON.stringify({ error: "INVALID_EXTERNAL_REFERENCE", message: "Webhook external_reference is not a valid subscription/preapproval session reference" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const expectedBusinessId = String(verifiedMetadata?.business_id || subscription.business_id);
      const expectedTenantId = String(verifiedMetadata?.tenant_id || subscription.tenant_id);
      const expectedPlanCode = String(verifiedMetadata?.plan_code || subscription.plan_code);
      if (!billingSessionReference.canonical) {
        console.log("Accepted legacy Mercado Pago checkout-session external_reference for backward compatibility only");
      }

      const { error: subscriptionSessionValidationError } = await supabaseAdmin.rpc("validate_billing_subscription_session", {
        p_external_reference: externalReference,
        p_business_id: expectedBusinessId,
        p_tenant_id: expectedTenantId,
        p_plan_code: expectedPlanCode,
        p_amount: amount,
        p_currency: currency,
        p_provider_subscription_id: lookupResourceId,
      });

      if (subscriptionSessionValidationError) {
        console.error("Subscription session validation failed:", subscriptionSessionValidationError.message);
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", { p_provider: provider, p_provider_event_id: providerEventId, p_state: "failed", p_failure_reason: "subscription_session_mismatch" });
        return new Response(
          JSON.stringify({ error: "SUBSCRIPTION_SESSION_MISMATCH", message: "Webhook does not match subscription session business, tenant, plan or amount" }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { error: updateError } = await supabaseAdmin.rpc("apply_subscription_event_transition", {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_provider_subscription_id: subscription.provider_subscription_id || lookupResourceId,
        p_event_type: eventAction,
        p_payload_hash: payloadHash,
        p_next_status: internalStatus,
        p_plan_code: subscription.plan_code,
        p_current_period_start: currentPeriodStart,
        p_current_period_end: currentPeriodEnd,
        p_occurred_at: currentPeriodStart || new Date().toISOString(),
      });

      if (updateError) {
        console.error("Error updating subscription:", updateError.message);
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", { p_provider: provider, p_provider_event_id: providerEventId, p_state: "failed", p_failure_reason: "subscription_transition_failed" });
        return new Response(
          JSON.stringify({ error: "SUBSCRIPTION_TRANSITION_FAILED", message: "Could not persist subscription transition" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        console.log("Updated subscription:", subscription.id, "to status:", internalStatus);
        if (providerPlanId && providerPlanId !== subscription.provider_plan_id) {
          await supabaseAdmin.from("business_subscriptions").update({ provider_plan_id: providerPlanId }).eq("id", subscription.id);
        }
      }

      // =============================================================================
      // 7. INSERT INTO PAYMENTS TABLE
      // =============================================================================
      if (eventType === "payment" && amount > 0) {
        const paymentStatus = internalStatus === "active" ? "approved" : internalStatus;

        const { error: paymentError } = await supabaseAdmin
          .from("payments")
          .insert({
            subscription_id: subscription.id,
            business_id: subscription.business_id,
            amount: amount,
            currency: currency,
            status: paymentStatus,
            payment_type: null, // Could extract from MP data if needed
            mp_payment_id: resourceId,
            mp_status_detail: mpStatusDetail,
            processed_at: new Date().toISOString(),
          });

        if (paymentError) {
          console.error("Error inserting payment:", paymentError);
        } else {
          console.log("Inserted payment for subscription:", subscription.id);
        }
      }

      const shouldSyncEntitlements =
        internalStatus === "active" ||
        (eventType === "payment" && mpVerifiedStatus?.toLowerCase() === "approved");

      if (shouldSyncEntitlements) {
        await syncEntitlementsForBusiness(supabaseAdmin, subscription.business_id, subscription.tenant_id);
      }
    } else {
      console.log("No subscription found for webhook resource", { resource_id: resourceId, provider_event_id: providerEventId });
    }

    // =============================================================================
    // 8. FINALIZE WEBHOOK EVENT (IDEMPOTENCY)
    // =============================================================================
    // Mark event as processed after side effects complete
    const { error: eventError } = await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
      p_provider: provider,
      p_provider_event_id: providerEventId,
      p_state: "processed",
      p_failure_reason: null,
    });

    if (eventError) {
      console.error("Error recording webhook event:", eventError);
    }

    // =============================================================================
    // 9. RETURN RESPONSE
    // =============================================================================
    recordWebhookProcessMetric({
      providerEventId,
      result: "success",
      retryable: false,
      idempotencyDecision: "first_seen",
      latencyMs: Date.now() - requestStartedAt,
      httpStatus: 200,
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: "Webhook procesado",
        status: internalStatus,
        event_id: providerEventId,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    recordWebhookProcessMetric({
      providerEventId: "unknown",
      result: "error",
      retryable: true,
      idempotencyDecision: "first_seen",
      latencyMs: Date.now() - requestStartedAt,
      httpStatus: 500,
    });
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
