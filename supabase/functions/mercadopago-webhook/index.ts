// mercadopago-webhook Edge Function
// Handles Mercado Pago webhook notifications for subscription status updates
// Endpoint: POST /functions/v1/mercadopago-webhook

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getBillingCorsHeaders,
  rejectDisallowedBrowserOrigin,
  requireServerSecret,
  verifyMercadoPagoWebhookSignature,
} from "../_shared/billing-security.ts";
import { recordWebhookProcessMetric } from "../_shared/mp-rollout-observability.ts";
import { mapWebhookStatusToSubscriptionStatus } from "../_shared/mp-subscription-guards.ts";
import { parseBillingSessionReference } from "../_shared/mp-subscription-session-reference.ts";
import { decryptPendingSignupPiiField } from "../_shared/pending-signup-pii.ts";

const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const PAYMENT_WEBHOOK_EVENTS_TABLE = "payment_webhook_events";
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
  const recent = (rateLimitStore.get(ip) || []).filter((ts) =>
    now - ts < RATE_LIMIT_WINDOW_MS
  );

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
  supabaseAdmin: SupabaseClient,
  businessId: string,
  tenantId: string,
): Promise<void> {
  const { error } = await supabaseAdmin.rpc(
    "get_business_entitlements_snapshot",
    {
      p_business_id: businessId,
      p_tenant_id: tenantId,
    },
  );

  if (error) {
    console.error("Error syncing plan entitlements:", error);
  } else {
    console.log("Entitlements synced for business:", businessId);
  }
}

async function materializePendingSignup(
  supabaseAdmin: SupabaseClient,
  params: {
    providerSubscriptionId: string;
    externalReference?: string;
    pendingSignupIntentId: string;
    providerPlanId?: string | null;
    currentPeriodStart?: string | null;
    currentPeriodEnd?: string | null;
  },
): Promise<
  {
    id: string;
    business_id: string;
    tenant_id: string;
    plan_code: string;
    provider_subscription_id?: string;
    provider_plan_id?: string;
  } | null
> {
  const { data: intent } = await supabaseAdmin
    .from("pending_signup_intents")
    .select("*")
    .eq("id", params.pendingSignupIntentId)
    .eq("provider", "mercado_pago")
    .eq("provider_subscription_id", params.providerSubscriptionId)
    .eq("status", "materializing")
    .maybeSingle();

  if (!intent) return null;

  const decryptedEmail = await decryptPendingSignupPiiField(intent.email_encrypted);
  const decryptedFirstName = await decryptPendingSignupPiiField(intent.first_name_encrypted);
  const decryptedLastName = await decryptPendingSignupPiiField(intent.last_name_encrypted);
  const decryptedPhone = await decryptPendingSignupPiiField(intent.phone_encrypted);
  const decryptedBusinessName = await decryptPendingSignupPiiField(intent.business_name_encrypted);

  if (!decryptedEmail) {
    await supabaseAdmin
      .from("pending_signup_intents")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", intent.id);
    throw new Error("pending_signup_email_decrypt_failed");
  }

  const { data: createdUser, error: createUserError } = await supabaseAdmin.auth
    .admin.createUser({
      email: decryptedEmail,
      email_confirm: true,
      user_metadata: {
        first_name: decryptedFirstName,
        last_name: decryptedLastName,
        phone: decryptedPhone,
        plan: intent.plan_code,
        onboarding_required: true,
        onboarding_completed: false,
        onboardingCompleted: false,
        source: "paid_signup_payment_approved",
      },
    });

  if (createUserError || !createdUser.user) {
    await supabaseAdmin
      .from("pending_signup_intents")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", intent.id);
    throw createUserError || new Error("pending_signup_user_create_failed");
  }

  const slugBase = String(decryptedBusinessName || "mi-negocio")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "mi-negocio";
  const slug = `${slugBase}-${String(intent.id).slice(0, 8)}`;

  const { data: business, error: businessError } = await supabaseAdmin
    .from("businesses")
    .insert({
      name: decryptedBusinessName || "Mi Negocio",
      slug,
      owner_id: createdUser.user.id,
      timezone: "America/Argentina/Buenos_Aires",
      is_active: true,
    })
    .select("id, owner_id")
    .single();

  if (businessError || !business) {
    throw businessError || new Error("pending_signup_business_create_failed");
  }

  await supabaseAdmin.from("business_onboarding_state").upsert({
    business_id: business.id,
    current_step: "onboarding_required",
    selected_plan_code: intent.plan_code,
    account_user_id: createdUser.user.id,
    business_type: intent.business_type,
    updated_at: new Date().toISOString(),
  });

  const { data: subscription, error: subscriptionError } = await supabaseAdmin
    .from("business_subscriptions")
    .insert({
      business_id: business.id,
      tenant_id: createdUser.user.id,
      plan_code: intent.plan_code,
      status: "active",
      period_start: params.currentPeriodStart || new Date().toISOString(),
      period_end: params.currentPeriodEnd || null,
      current_period_start: params.currentPeriodStart ||
        new Date().toISOString(),
      current_period_end: params.currentPeriodEnd || null,
      provider: "mercado_pago",
      provider_subscription_id: params.providerSubscriptionId,
      provider_plan_id: params.providerPlanId || null,
      mp_preapproval_id: params.providerSubscriptionId,
      mp_preapproval_status: "active",
      start_date: params.currentPeriodStart || new Date().toISOString(),
    })
    .select(
      "id, business_id, tenant_id, plan_code, provider_subscription_id, provider_plan_id",
    )
    .single();

  if (subscriptionError || !subscription) {
    throw subscriptionError ||
      new Error("pending_signup_subscription_create_failed");
  }

  await supabaseAdmin
    .from("pending_signup_intents")
    .update({
      status: "materialized",
      user_id: createdUser.user.id,
      business_id: business.id,
      materialized_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", intent.id)
    .eq("status", "materializing");

  const { data: magicLink } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email: decryptedEmail,
  });

  const actionLink = magicLink?.properties?.action_link;
  await supabaseAdmin.from("notification_email_outbox").insert({
    business_id: business.id,
    to_email: decryptedEmail,
    template_key: "paid_signup_magic_link",
    payload: {
      subject: "Activá tu cuenta de Orvel",
      html: actionLink
        ? `<p>Tu pago fue aprobado. Ingresá a Orvel con este enlace seguro:</p><p><a href="${actionLink}">Entrar a Orvel</a></p>`
        : `<p>Tu pago fue aprobado. Ingresá a Orvel desde la pantalla de login para recibir tu enlace mágico.</p>`,
    },
  });

  return subscription;
}

// Verify payment status with MP API (server-truth)
async function verifyPaymentStatus(paymentId: string): Promise<
  {
    status: string;
    status_detail: string;
    amount: number;
    currency: string;
    external_reference?: string;
    metadata?: Record<string, unknown>;
    date_approved?: string;
  } | MpVerificationFailure
> {
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
      },
    );

    if (!response.ok) {
      console.error("MP API returned:", response.status);
      return {
        retryable: response.status >= 500 || response.status === 429,
        reason: `mp_payment_lookup_http_${response.status}`,
      };
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
async function verifyPreapprovalStatus(preapprovalId: string): Promise<
  {
    status: string;
    external_reference?: string;
    reason?: string;
    auto_recurring?: {
      transaction_amount?: number;
      currency_id?: string;
      start_date?: string;
      end_date?: string;
    };
    preapproval_plan_id?: string;
    next_payment_date?: string;
    date_created?: string;
  } | MpVerificationFailure
> {
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
      },
    );

    if (!response.ok) {
      return {
        retryable: response.status >= 500 || response.status === 429,
        reason: `mp_preapproval_lookup_http_${response.status}`,
      };
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
      JSON.stringify({
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many requests",
      }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "METHOD_NOT_ALLOWED",
        message: "Solo POST permitido",
      }),
      {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    // =============================================================================
    // 1. VERIFY SIGNATURE (always enforced)
    // =============================================================================
    const body = await req.text();
    if (!Deno.env.get("MP_WEBHOOK_SECRET")?.trim()) {
      return new Response(
        JSON.stringify({
          error: "SERVER_CONFIG_ERROR",
          message: "MP_WEBHOOK_SECRET not configured",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const isValid = await verifyMercadoPagoWebhookSignature(req, body);
    if (!isValid) {
      console.log("Invalid signature");
      return new Response(
        JSON.stringify({
          error: "INVALID_SIGNATURE",
          message: "Firma inválida",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Parse webhook payload
    let payload: WebhookPayload;
    try {
      payload = JSON.parse(body);
    } catch {
      return new Response(
        JSON.stringify({ error: "INVALID_JSON", message: "Payload inválido" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
    const requestId = req.headers.get("x-request-id") ||
      req.headers.get("x-idempotency-key");
    const providerEventId = payload.id || requestId ||
      `${eventType}:${eventAction}:${resourceId}`;
    const signatureHeader = req.headers.get("x-signature") || "";
    const signatureParts = Object.fromEntries(
      signatureHeader.split(",").map((part) =>
        part.split("=").map((entry) => entry.trim())
      ).filter((part) => part.length === 2),
    );
    const signatureTs = Number(signatureParts.ts || 0);
    const signatureV1 = signatureParts.v1 || "";

    if (!resourceId) {
      return new Response(
        JSON.stringify({
          error: "NO_RESOURCE_ID",
          message: "ID de recurso no proporcionado",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!requestId || !Number.isFinite(signatureTs) || !signatureV1) {
      return new Response(
        JSON.stringify({
          error: "INVALID_WEBHOOK_HEADERS",
          message: "Missing x-request-id or signature metadata",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
      .from(PAYMENT_WEBHOOK_EVENTS_TABLE)
      .select("id, processed_at, payload_hash")
      .eq("provider", provider)
      .eq("provider_event_id", providerEventId)
      .maybeSingle();

    if (
      existingEvent?.processed_at && existingEvent.payload_hash === payloadHash
    ) {
      recordWebhookProcessMetric({
        providerEventId,
        result: "duplicate",
        retryable: false,
        idempotencyDecision: "duplicate_processed",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 200,
      });
      return new Response(
        JSON.stringify({
          success: true,
          message: "Evento ya procesado",
          event_id: existingEvent.id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (
      existingEvent && existingEvent.payload_hash &&
      existingEvent.payload_hash !== payloadHash
    ) {
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
        JSON.stringify({
          error: "IDEMPOTENCY_PAYLOAD_MISMATCH",
          message: "Payload conflict for existing provider_event_id",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    await supabaseAdmin
      .from("payment_webhook_events")
      .upsert({
        provider,
        provider_event_id: providerEventId,
        payload_hash: payloadHash,
        processing_state: "reserved",
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

    const { data: reservation, error: reservationError } = await supabaseAdmin
      .rpc("reserve_payment_webhook_event", {
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
        JSON.stringify({
          error: "IDEMPOTENCY_WRITE_FAILED",
          message: "Could not persist webhook event idempotency",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const reservationDecision = Array.isArray(reservation)
      ? reservation[0]?.decision
      : reservation?.decision;
    const reservedEventId = Array.isArray(reservation)
      ? reservation[0]?.event_id
      : reservation?.event_id;

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
        JSON.stringify({
          error: "IDEMPOTENCY_PAYLOAD_MISMATCH",
          message: "Payload conflict for existing provider_event_id",
        }),
        {
          status: 409,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
        JSON.stringify({
          success: true,
          message: "Evento ya procesado",
          event_id: reservedEventId,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!["reserved", "retry"].includes(String(reservationDecision))) {
      await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_state: "failed",
        p_failure_reason: `unexpected_reservation_decision:${
          String(reservationDecision || "unknown")
        }`,
      });

      return new Response(
        JSON.stringify({
          error: "IDEMPOTENCY_RESERVATION_INVALID",
          message: "Unexpected idempotency reservation decision",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
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
    } else if (
      eventType === "preapproval" || eventType === "subscription_preapproval"
    ) {
      const verified = await verifyPreapprovalStatus(resourceId);
      if ("status" in verified) {
        mpVerifiedStatus = verified.status;
        externalReference = verified.external_reference || externalReference;
        amount = Number(verified.auto_recurring?.transaction_amount || amount);
        currency = verified.auto_recurring?.currency_id || currency;
        providerPlanId = verified.preapproval_plan_id || null;
        currentPeriodStart = verified.auto_recurring?.start_date ||
          verified.date_created || null;
        currentPeriodEnd = verified.next_payment_date ||
          verified.auto_recurring?.end_date || null;
      } else {
        verificationFailure = verified;
      }
    }

    if (!mpVerifiedStatus) {
      const failureReason = verificationFailure?.reason ||
        "mp_server_truth_unverified";
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
          message:
            "No se pudo verificar el estado con Mercado Pago; evento marcado para reintento",
          retryable: verificationFailure?.retryable ?? true,
        }),
        {
          status: verificationFailure?.retryable === false ? 422 : 503,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "30",
          },
        },
      );
    }

    const internalStatus = mapWebhookStatusToSubscriptionStatus(
      eventType,
      mpVerifiedStatus,
    );

    // =============================================================================
    // 5. FIND AND UPDATE SUBSCRIPTION
    // =============================================================================
    // Try to find subscription by MP preapproval_id or provider_subscription_id
    let subscription: {
      id: string;
      business_id: string;
      tenant_id: string;
      plan_code: string;
      provider_subscription_id?: string;
      provider_plan_id?: string;
    } | null = null;
    const lookupResourceId = String(
      verifiedMetadata?.provider_subscription_id ||
        verifiedMetadata?.preapproval_id || resourceId,
    );

    // First try: find by mp_preapproval_id
    const { data: subByPreapproval } = await supabaseAdmin
      .from("business_subscriptions")
      .select(
        "id, business_id, tenant_id, plan_code, provider_subscription_id, provider_plan_id",
      )
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
        .select(
          "id, business_id, tenant_id, plan_code, provider_subscription_id, provider_plan_id",
        )
        .eq("provider_subscription_id", lookupResourceId)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (subByProvider) {
        subscription = subByProvider;
      }
    }

    const webhookPaymentApproved = internalStatus === "active" ||
      (eventType === "payment" &&
        mpVerifiedStatus?.toLowerCase() === "approved");

    if (!subscription && webhookPaymentApproved) {
      const billingSessionReference = parseBillingSessionReference(
        externalReference,
      );
      if (!billingSessionReference) {
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_state: "failed",
          p_failure_reason: "invalid_pending_signup_external_reference",
        });
        return new Response(
          JSON.stringify({
            error: "INVALID_EXTERNAL_REFERENCE",
            message: "Pending signup webhook external_reference is invalid",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { data: pendingValidation, error: pendingValidationError } =
        await supabaseAdmin.rpc(
          "validate_pending_signup_subscription_session",
          {
            p_external_reference: externalReference,
            p_amount: amount,
            p_currency: currency,
            p_provider_subscription_id: lookupResourceId,
          },
        );

      const pendingSignupIntentId = Array.isArray(pendingValidation)
        ? pendingValidation[0]?.pending_signup_intent_id ||
          pendingValidation[0]?.intent_id || pendingValidation[0]
        : pendingValidation?.pending_signup_intent_id ||
          pendingValidation?.intent_id || pendingValidation;

      if (pendingValidationError || !pendingSignupIntentId) {
        console.error(
          "Pending signup session validation failed:",
          pendingValidationError?.message,
        );
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_state: "failed",
          p_failure_reason: "pending_signup_session_mismatch",
        });
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_SESSION_MISMATCH",
            message:
              "Webhook does not match a valid pending paid signup session",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      try {
        subscription = await materializePendingSignup(supabaseAdmin, {
          providerSubscriptionId: lookupResourceId,
          externalReference,
          pendingSignupIntentId: String(pendingSignupIntentId),
          providerPlanId,
          currentPeriodStart,
          currentPeriodEnd,
        });
      } catch (materializeError) {
        console.error("Pending signup materialization failed", {
          provider_event_id: providerEventId,
          resource_id: resourceId,
          reason: materializeError instanceof Error
            ? materializeError.message
            : "unknown",
        });
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_state: "failed",
          p_failure_reason: "pending_signup_materialization_failed",
        });
        return new Response(
          JSON.stringify({
            error: "PENDING_SIGNUP_MATERIALIZATION_FAILED",
            message: "Could not materialize paid signup after approved payment",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
    }

    // =============================================================================
    // 6. UPDATE BUSINESS SUBSCRIPTION
    // =============================================================================
    if (subscription) {
      const billingSessionReference = parseBillingSessionReference(
        externalReference,
      );
      if (!billingSessionReference) {
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_state: "failed",
          p_failure_reason: "invalid_external_reference",
        });
        return new Response(
          JSON.stringify({
            error: "INVALID_EXTERNAL_REFERENCE",
            message:
              "Webhook external_reference is not a valid subscription/preapproval session reference",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const expectedBusinessId = String(
        verifiedMetadata?.business_id || subscription.business_id,
      );
      const expectedTenantId = String(
        verifiedMetadata?.tenant_id || subscription.tenant_id,
      );
      const expectedPlanCode = String(
        verifiedMetadata?.plan_code || subscription.plan_code,
      );
      if (!billingSessionReference.canonical) {
        console.log(
          "Accepted legacy Mercado Pago checkout-session external_reference for backward compatibility only",
        );
      }

      const { error: subscriptionSessionValidationError } = await supabaseAdmin
        .rpc("validate_billing_subscription_session", {
          p_external_reference: externalReference,
          p_business_id: expectedBusinessId,
          p_tenant_id: expectedTenantId,
          p_plan_code: expectedPlanCode,
          p_amount: amount,
          p_currency: currency,
          p_provider_subscription_id: lookupResourceId,
        });

      if (subscriptionSessionValidationError) {
        console.error(
          "Subscription session validation failed:",
          subscriptionSessionValidationError.message,
        );
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_state: "failed",
          p_failure_reason: "subscription_session_mismatch",
        });
        return new Response(
          JSON.stringify({
            error: "SUBSCRIPTION_SESSION_MISMATCH",
            message:
              "Webhook does not match subscription session business, tenant, plan or amount",
          }),
          {
            status: 422,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { error: updateError } = await supabaseAdmin.rpc(
        "apply_subscription_event_transition",
        {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_provider_subscription_id: subscription.provider_subscription_id ||
            lookupResourceId,
          p_event_type: eventAction,
          p_payload_hash: payloadHash,
          p_next_status: internalStatus,
          p_plan_code: subscription.plan_code,
          p_current_period_start: currentPeriodStart,
          p_current_period_end: currentPeriodEnd,
          p_occurred_at: currentPeriodStart || new Date().toISOString(),
        },
      );

      if (updateError) {
        console.error("Error updating subscription:", updateError.message);
        await supabaseAdmin.rpc("mark_payment_webhook_event_state", {
          p_provider: provider,
          p_provider_event_id: providerEventId,
          p_state: "failed",
          p_failure_reason: "subscription_transition_failed",
        });
        return new Response(
          JSON.stringify({
            error: "SUBSCRIPTION_TRANSITION_FAILED",
            message: "Could not persist subscription transition",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      } else {
        console.log(
          "Updated subscription:",
          subscription.id,
          "to status:",
          internalStatus,
        );
        if (
          providerPlanId && providerPlanId !== subscription.provider_plan_id
        ) {
          await supabaseAdmin.from("business_subscriptions").update({
            provider_plan_id: providerPlanId,
          }).eq("id", subscription.id);
        }
      }

      // =============================================================================
      // 7. INSERT INTO PAYMENTS TABLE
      // =============================================================================
      if (eventType === "payment" && amount > 0) {
        const paymentStatus = internalStatus === "active"
          ? "approved"
          : internalStatus;

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

      const shouldSyncEntitlements = internalStatus === "active" ||
        (eventType === "payment" &&
          mpVerifiedStatus?.toLowerCase() === "approved");

      if (shouldSyncEntitlements) {
        // materializePendingSignup is executed above for approved pending_signup_intent records
        // before entitlements are synced, so business_id/user_id exist for paid signup.
        await syncEntitlementsForBusiness(
          supabaseAdmin,
          subscription.business_id,
          subscription.tenant_id,
        );
      }
    } else {
      console.log("No subscription found for webhook resource", {
        resource_id: resourceId,
        provider_event_id: providerEventId,
      });
    }

    // =============================================================================
    // 8. FINALIZE WEBHOOK EVENT (IDEMPOTENCY)
    // =============================================================================
    // Mark event as processed after side effects complete
    const { error: eventError } = await supabaseAdmin.rpc(
      "mark_payment_webhook_event_state",
      {
        p_provider: provider,
        p_provider_event_id: providerEventId,
        p_state: "processed",
        p_failure_reason: null,
      },
    );

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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      JSON.stringify({
        error: "INTERNAL_ERROR",
        message: "Error interno del servidor",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
