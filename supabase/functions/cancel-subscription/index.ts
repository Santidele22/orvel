// cancel-subscription Edge Function
// Records subscription and account cancellation requests without revoking paid-through access early.
// Endpoint: POST /functions/v1/cancel-subscription

import { createClient } from "@supabase/supabase-js";
import {
  getBillingCorsHeaders,
  rejectDisallowedBrowserOrigin,
  requireServerSecret,
} from "../_shared/billing-security.ts";

const RATE_LIMIT_MAX_REQUESTS = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MP_API_BASE = "https://api.mercadopago.com";
const MP_CANCEL_ATTEMPT_TIMEOUT_MS = 10_000;
const MP_CANCEL_RETRY_BACKOFF_MS = [250, 1_000];
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

interface CancelSubscriptionRequest {
  business_id: string;
  reason?: string;
  mode?: "subscription_cancellation" | "account_cancellation";
}

interface CancelSubscriptionHandlerDependencies {
  createSupabaseAdminClient?: () => any;
  getCorsHeaders?: (req: Request) => Record<string, string>;
  rejectDisallowedOrigin?: (req: Request) => Response | null;
  isRateLimitedRequest?: (req: Request) => boolean;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  mpCancelAttemptTimeoutMs?: number;
  envGet?: (key: string) => string | undefined;
  now?: () => Date;
  logError?: (...args: unknown[]) => void;
}

type CurrentSubscription = Record<string, any> | null;

type EventInsertResult = { ok: true; duplicate?: boolean } | { ok: false; error: unknown };

type ExistingAccountCancellationEvents = {
  requested: { occurred_at: string } | null;
  providerCancelled: { occurred_at: string } | null;
  scheduled: { occurred_at: string } | null;
  providerFailed: { occurred_at: string } | null;
  validationFailed: { occurred_at: string } | null;
  retryStarted: { occurred_at: string } | null;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function createDefaultSupabaseAdminClient() {
  return createClient(
    requireServerSecret("SUPABASE_URL"),
    requireServerSecret("SUPABASE_SERVICE_ROLE_KEY"),
  );
}

function resolveProviderSubscriptionId(subscription: CurrentSubscription): string | null {
  if (!subscription) return null;
  return subscription.provider_subscription_id || subscription.mp_preapproval_id || null;
}

function resolvePaidThroughDate(subscription: CurrentSubscription): string | null {
  if (!subscription) return null;
  return subscription.period_end || subscription.current_period_end || null;
}

function isTransientMercadoPagoCancellationFailure(result: { ok: false; status?: number }): boolean {
  return result.status === undefined || result.status === 408 || result.status === 409 || result.status === 425 ||
    result.status === 429 || result.status >= 500;
}

async function cancelMercadoPagoRenewalAttempt(input: {
  providerSubscriptionId: string;
  accessToken: string;
  fetchFn: typeof fetch;
  timeoutMs: number;
}): Promise<{ ok: true } | { ok: false; status?: number }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs);

  try {
    const response = await input.fetchFn(
      `${MP_API_BASE}/preapproval/${encodeURIComponent(input.providerSubscriptionId)}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${input.accessToken}`,
        },
        body: JSON.stringify({ status: "cancelled" }),
        signal: controller.signal,
      },
    );

    if (!response.ok) return { ok: false, status: response.status };

    const responseText = await response.text().catch(() => "");
    if (!responseText.trim()) return { ok: false, status: response.status };

    try {
      const payload = JSON.parse(responseText) as Record<string, unknown>;
      const returnedStatus = typeof payload.status === "string" ? payload.status.toLowerCase() : null;
      const returnedId = typeof payload.id === "string" ? payload.id : null;

      if ((returnedStatus !== "cancelled" && returnedStatus !== "canceled") || returnedId !== input.providerSubscriptionId) {
        return { ok: false, status: response.status };
      }
    } catch {
      return { ok: false, status: response.status };
    }

    return { ok: true };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

async function cancelMercadoPagoRenewal(input: {
  providerSubscriptionId: string;
  accessToken: string;
  fetchFn: typeof fetch;
  sleepFn?: (ms: number) => Promise<void>;
  retryBackoffMs?: number[];
  timeoutMs?: number;
}): Promise<{ ok: true } | { ok: false; status?: number }> {
  const retryBackoffMs = input.retryBackoffMs ?? MP_CANCEL_RETRY_BACKOFF_MS;
  const sleepFn = input.sleepFn ?? sleep;
  const timeoutMs = input.timeoutMs ?? MP_CANCEL_ATTEMPT_TIMEOUT_MS;
  let lastFailure: { ok: false; status?: number } = { ok: false };

  for (let attempt = 0; attempt <= retryBackoffMs.length; attempt += 1) {
    const result = await cancelMercadoPagoRenewalAttempt({ ...input, timeoutMs });
    if (result.ok) return result;

    lastFailure = result;
    if (!isTransientMercadoPagoCancellationFailure(result) || attempt === retryBackoffMs.length) break;
    await sleepFn(retryBackoffMs[attempt]);
  }

  return lastFailure;
}

function buildSubscriptionResponse(
  subscription: CurrentSubscription,
  options: { includeProviderSubscriptionId?: boolean } = {},
) {
  const response: Record<string, unknown> = {
    id: subscription?.id || "none",
    status: subscription?.status || "none",
    plan_code: subscription?.plan_code || null,
    period_end: resolvePaidThroughDate(subscription),
  };

  if (options.includeProviderSubscriptionId) {
    response.provider_subscription_id = resolveProviderSubscriptionId(subscription);
  }

  return response;
}

function isNoRowsSubscriptionLookup(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "PGRST116");
}

function needsAccountCancellationStateRepair(subscription: CurrentSubscription): boolean {
  if (!subscription) return false;

  return subscription.cancel_at_period_end !== true ||
    subscription.cancel_reason !== "account_cancellation_requested" ||
    !subscription.cancelled_at;
}

function requiresProviderCancellation(subscription: CurrentSubscription): boolean {
  if (!subscription) return false;

  const provider = String(subscription.provider || "mercado_pago").toLowerCase();
  const status = String(subscription.status || "").toLowerCase();
  const planCode = String(subscription.plan_code || "").toLowerCase();

  return provider === "mercado_pago" &&
    ["active", "pending", "trialing", "scheduled_change"].includes(status) &&
    !["free", "gratis", "none"].includes(planCode);
}

function requiresPaidThroughAccess(subscription: CurrentSubscription): boolean {
  if (!subscription) return false;

  const status = String(subscription.status || "").toLowerCase();
  const planCode = String(subscription.plan_code || "").toLowerCase();

  return ["active", "pending", "trialing", "scheduled_change"].includes(status) &&
    !["free", "gratis", "none"].includes(planCode);
}

function retryLockBucket(date: Date): string {
  return date.toISOString().slice(0, 16);
}

function hasPersistedAccountCancellationState(
  subscription: CurrentSubscription,
  expectedCancelledAt: string,
): boolean {
  const persistedCancelledAt = typeof subscription?.cancelled_at === "string" ? subscription.cancelled_at : null;
  const persistedCancelledAtMs = persistedCancelledAt ? Date.parse(persistedCancelledAt) : NaN;
  const expectedCancelledAtMs = Date.parse(expectedCancelledAt);

  return Boolean(
    subscription &&
      subscription.cancel_at_period_end === true &&
      subscription.cancel_reason === "account_cancellation_requested" &&
      Number.isFinite(persistedCancelledAtMs) &&
      Number.isFinite(expectedCancelledAtMs) &&
      persistedCancelledAtMs === expectedCancelledAtMs,
  );
}

async function updateAccountCancellationSubscriptionState(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  timestamp: string;
}): Promise<{ error: unknown | null }> {
  if (!input.subscription) return { error: null };

  const { error } = await input.supabaseAdmin
    .from("business_subscriptions")
    .update({
      cancel_at_period_end: true,
      cancel_reason: "account_cancellation_requested",
      cancelled_at: input.timestamp,
      updated_at: input.timestamp,
    })
    .eq("id", input.subscription.id);

  if (error) return { error };

  const { data: persistedSubscription, error: verifyError } = await input.supabaseAdmin
    .from("business_subscriptions")
    .select("cancel_at_period_end, cancel_reason, cancelled_at")
    .eq("id", input.subscription.id)
    .single();

  if (verifyError) return { error: verifyError };

  if (!hasPersistedAccountCancellationState(persistedSubscription, input.timestamp)) {
    return {
      error: {
        code: "ACCOUNT_CANCELLATION_STATE_VERIFY_FAILED",
        message: "Subscription cancellation state was not persisted",
      },
    };
  }

  return { error: null };
}

async function buildScheduledAccountCancellationResponse(input: {
  supabaseAdmin: any;
  currentSubscription: CurrentSubscription;
  scheduledAt: string | null;
  requestedAt: string;
  paidThroughDate: string | null;
  reason: string | undefined;
  corsHeaders: Record<string, string>;
  needsProviderCancellation: boolean;
  hasProviderCancelledEvidence: boolean;
  logError: (...args: unknown[]) => void;
}): Promise<Response> {
  if (input.needsProviderCancellation && !input.hasProviderCancelledEvidence) {
    return new Response(
      JSON.stringify({
        error: "ACCOUNT_CANCELLATION_PROVIDER_EVIDENCE_MISSING",
        message: "La baja de cuenta no tiene evidencia durable de cancelación de renovación en Mercado Pago",
      }),
      {
        status: 409,
        headers: { ...input.corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const persistedAt = input.scheduledAt || input.requestedAt;
  if (needsAccountCancellationStateRepair(input.currentSubscription)) {
    const { error: subscriptionRepairError } = await updateAccountCancellationSubscriptionState({
      supabaseAdmin: input.supabaseAdmin,
      subscription: input.currentSubscription,
      timestamp: persistedAt,
    });

    if (subscriptionRepairError) {
      input.logError("Error repairing account cancellation subscription state:", subscriptionRepairError);
      return new Response(
        JSON.stringify({
          error: "ACCOUNT_CANCELLATION_STATE_FAILED",
          message: "Error al registrar el estado de baja de cuenta",
        }),
        {
          status: 500,
          headers: { ...input.corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
  }

  return new Response(
    JSON.stringify({
      success: true,
      message: "Solicitud de baja de cuenta ya recibida. Mantenemos el acceso hasta el final del período pago.",
      account_closure_at: input.paidThroughDate,
      request: {
        status: "already_requested",
        requested_at: input.scheduledAt,
        reason: input.reason || "manual_request",
      },
      subscription: buildSubscriptionResponse(input.currentSubscription),
    }),
    { headers: { ...input.corsHeaders, "Content-Type": "application/json" } },
  );
}

async function recordSubscriptionEvent(input: {
  supabaseAdmin: any;
  subscription: CurrentSubscription;
  businessId: string;
  provider: string;
  providerEventId: string;
  providerSubscriptionId: string | null;
  eventType: string;
  occurredAt: string;
  payload: Record<string, unknown>;
  transitionAction: string;
}): Promise<EventInsertResult> {
  const { error } = await input.supabaseAdmin
    .from("subscription_events")
    .insert({
      tenant_id: input.subscription?.tenant_id || input.businessId,
      business_id: input.businessId,
      subscription_id: input.subscription?.id || null,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      provider_subscription_id: input.providerSubscriptionId,
      event_type: input.eventType,
      occurred_at: input.occurredAt,
      raw_payload: input.payload,
      payload_hash: `sha256:${await sha256Hex(JSON.stringify(input.payload))}`,
      transition_action: input.transitionAction,
      previous_status: input.subscription?.status || null,
      next_status: input.subscription?.status || null,
      previous_version: input.subscription?.version ?? null,
      next_version: input.subscription?.version ?? null,
    });

  if (error?.code === "23505") {
    return { ok: true, duplicate: true };
  }

  return error ? { ok: false, error } : { ok: true };
}

async function lookupSubscriptionEvent(input: {
  supabaseAdmin: any;
  provider: string;
  providerEventId: string;
}): Promise<{ data: { occurred_at: string } | null; error: unknown | null }> {
  const { data, error } = await input.supabaseAdmin
    .from("subscription_events")
    .select("occurred_at")
    .eq("provider", input.provider)
    .eq("provider_event_id", input.providerEventId)
    .order("occurred_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return { data: data ?? null, error: error ?? null };
}

async function lookupExistingAccountCancellationEvents(input: {
  supabaseAdmin: any;
  provider: string;
  requestedEventId: string;
  providerCancelledEventId: string;
  scheduledEventId: string;
  providerFailedEventId: string;
  validationFailedEventId: string;
  retryStartedEventId: string;
}): Promise<{ data: ExistingAccountCancellationEvents; error: unknown | null }> {
  const empty = { requested: null, providerCancelled: null, scheduled: null, providerFailed: null, validationFailed: null, retryStarted: null };
  const scheduled = await lookupSubscriptionEvent({
    supabaseAdmin: input.supabaseAdmin,
    provider: input.provider,
    providerEventId: input.scheduledEventId,
  });
  if (scheduled.error) return { data: empty, error: scheduled.error };

  const providerCancelled = await lookupSubscriptionEvent({
    supabaseAdmin: input.supabaseAdmin,
    provider: input.provider,
    providerEventId: input.providerCancelledEventId,
  });
  if (providerCancelled.error) return { data: empty, error: providerCancelled.error };

  const requested = await lookupSubscriptionEvent({
    supabaseAdmin: input.supabaseAdmin,
    provider: input.provider,
    providerEventId: input.requestedEventId,
  });
  if (requested.error) return { data: empty, error: requested.error };

  const providerFailed = await lookupSubscriptionEvent({
    supabaseAdmin: input.supabaseAdmin,
    provider: input.provider,
    providerEventId: input.providerFailedEventId,
  });
  if (providerFailed.error) return { data: empty, error: providerFailed.error };

  const validationFailed = await lookupSubscriptionEvent({
    supabaseAdmin: input.supabaseAdmin,
    provider: input.provider,
    providerEventId: input.validationFailedEventId,
  });
  if (validationFailed.error) return { data: empty, error: validationFailed.error };

  const retryStarted = await lookupSubscriptionEvent({
    supabaseAdmin: input.supabaseAdmin,
    provider: input.provider,
    providerEventId: input.retryStartedEventId,
  });
  if (retryStarted.error) return { data: empty, error: retryStarted.error };

  return {
    data: {
      requested: requested.data,
      providerCancelled: providerCancelled.data,
      scheduled: scheduled.data,
      providerFailed: providerFailed.data,
      validationFailed: validationFailed.data,
      retryStarted: retryStarted.data,
    },
    error: null,
  };
}

export function createCancelSubscriptionHandler(
  dependencies: CancelSubscriptionHandlerDependencies = {},
) {
  const createSupabaseAdminClient = dependencies.createSupabaseAdminClient ??
    createDefaultSupabaseAdminClient;
  const getCorsHeaders = dependencies.getCorsHeaders ?? getBillingCorsHeaders;
  const rejectDisallowedOrigin = dependencies.rejectDisallowedOrigin ??
    rejectDisallowedBrowserOrigin;
  const isRateLimitedRequest = dependencies.isRateLimitedRequest ??
    isRateLimited;
  const fetchFn = dependencies.fetch ?? fetch;
  const sleepFn = dependencies.sleep ?? sleep;
  const mpCancelAttemptTimeoutMs = dependencies.mpCancelAttemptTimeoutMs ?? MP_CANCEL_ATTEMPT_TIMEOUT_MS;
  const envGet = dependencies.envGet ?? ((key: string) => Deno.env.get(key));
  const now = dependencies.now ?? (() => new Date());
  const logError = dependencies.logError ?? console.error;

  return async (req: Request): Promise<Response> => {
    const corsHeaders = getCorsHeaders(req);

    // Handle CORS preflight
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }

    const disallowedOrigin = rejectDisallowedOrigin(req);
    if (disallowedOrigin) return disallowedOrigin;

    if (isRateLimitedRequest(req)) {
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

    try {
      // =============================================================================
      // 1. VERIFY USER AUTHENTICATION
      // =============================================================================
      const authHeader = req.headers.get("Authorization");
      if (!authHeader) {
        return new Response(
          JSON.stringify({
            error: "AUTHORIZATION_REQUIRED",
            message: "Token de autenticación requerido",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const token = authHeader.replace("Bearer ", "");

      // Create Supabase client with admin privileges to bypass RLS
      const supabaseAdmin = createSupabaseAdminClient();

      // Verify JWT and get user
      const { data: { user }, error: authError } = await supabaseAdmin.auth
        .getUser(token);
      if (authError || !user) {
        return new Response(
          JSON.stringify({
            error: "INVALID_TOKEN",
            message: "Token inválido o expirado",
          }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // =============================================================================
      // 2. PARSE AND VALIDATE REQUEST
      // =============================================================================
      let body: CancelSubscriptionRequest;
      try {
        body = await req.json();
      } catch {
        return new Response(
          JSON.stringify({
            error: "INVALID_JSON",
            message: "Cuerpo de solicitud inválido",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const { business_id, reason } = body;
      if (
        body.mode !== undefined &&
        body.mode !== "subscription_cancellation" &&
        body.mode !== "account_cancellation"
      ) {
        return new Response(
          JSON.stringify({
            error: "INVALID_MODE",
            message: "Modo de baja inválido",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const mode = body.mode === "account_cancellation"
        ? "account_cancellation"
        : "subscription_cancellation";
      if (!business_id || typeof business_id !== "string") {
        return new Response(
          JSON.stringify({
            error: "BUSINESS_ID_REQUIRED",
            message: "El campo business_id es requerido",
          }),
          {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // =============================================================================
      // 3. VERIFY USER OWNS THE BUSINESS
      // =============================================================================
      const { data: business, error: businessError } = await supabaseAdmin
        .from("businesses")
        .select("id, name, owner_id")
        .eq("id", business_id)
        .eq("owner_id", user.id)
        .single();

      if (businessError || !business) {
        return new Response(
          JSON.stringify({
            error: "BUSINESS_NOT_FOUND",
            message: "Negocio no encontrado o no te pertenece",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // =============================================================================
      // 4. GET CURRENT ACTIVE SUBSCRIPTION
      // =============================================================================
      const { data: currentSubscription, error: subError } = await supabaseAdmin
        .from("business_subscriptions")
        .select("*")
        .eq("business_id", business_id)
        .in("status", ["active", "pending", "trialing", "scheduled_change"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (subError && (mode !== "account_cancellation" || !isNoRowsSubscriptionLookup(subError))) {
        logError("Error looking up active subscription:", subError);
        return new Response(
          JSON.stringify({
            error: "SUBSCRIPTION_LOOKUP_FAILED",
            message: "Error al buscar la suscripción activa",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if ((subError || !currentSubscription) && mode !== "account_cancellation") {
        return new Response(
          JSON.stringify({
            error: "NO_ACTIVE_SUBSCRIPTION",
            message: "No tienes una suscripción activa para cancelar",
          }),
          {
            status: 404,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      // =============================================================================
      // 5. RECORD CANCELLATION REQUEST AND PRESERVE PAID-THROUGH ACCESS
      // =============================================================================
      const requestedAtDate = now();
      const requestedAt = requestedAtDate.toISOString();
      const providerSubscriptionId = resolveProviderSubscriptionId(currentSubscription);
      const paidThroughDate = resolvePaidThroughDate(currentSubscription);
      const isAccountCancellation = mode === "account_cancellation";
      const needsProviderCancellation = isAccountCancellation && requiresProviderCancellation(currentSubscription);
      const needsPaidThroughAccess = isAccountCancellation && requiresPaidThroughAccess(currentSubscription);
      const eventProvider = isAccountCancellation ? "orvel_account" : "orvel_manual";
      const accountCancellationBaseId =
        `account-cancel-request:${business_id}:${currentSubscription?.id || "no-subscription"}`;
      const cancellationRequestProviderEventId = isAccountCancellation
        ? `${accountCancellationBaseId}:requested`
        : `manual-cancel-request:${currentSubscription!.id}`;
      const accountCancellationProviderCancelledEventId = `${accountCancellationBaseId}:provider-cancelled`;
      const accountCancellationScheduledEventId = `${accountCancellationBaseId}:scheduled`;
      const accountCancellationFailureEventId = `${accountCancellationBaseId}:provider-failed`;
      const accountCancellationValidationFailedEventId = `${accountCancellationBaseId}:validation-failed`;
      const accountCancellationRetryStartedEventId = `${accountCancellationBaseId}:retry-started:${retryLockBucket(requestedAtDate)}`;

      const accountCancellationEvents = isAccountCancellation
        ? await lookupExistingAccountCancellationEvents({
          supabaseAdmin,
          provider: eventProvider,
          requestedEventId: cancellationRequestProviderEventId,
          providerCancelledEventId: accountCancellationProviderCancelledEventId,
          scheduledEventId: accountCancellationScheduledEventId,
          providerFailedEventId: accountCancellationFailureEventId,
          validationFailedEventId: accountCancellationValidationFailedEventId,
          retryStartedEventId: accountCancellationRetryStartedEventId,
        })
        : null;

      if (accountCancellationEvents?.error) {
        logError("Error looking up existing account cancellation events:", accountCancellationEvents.error);
        return new Response(
          JSON.stringify({
            error: "ACCOUNT_CANCELLATION_STATE_LOOKUP_FAILED",
            message: "Error al verificar el estado de baja de cuenta",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const requestPayload = {
        business_id,
        reason: reason || "manual_request",
        requested_by: user.id,
        requested_at: requestedAt,
        account_closure_at: isAccountCancellation ? paidThroughDate : null,
        mode: isAccountCancellation
          ? "account_cancellation_at_period_end"
          : "manual_support_processing",
      };

      if (isAccountCancellation && !currentSubscription) {
        const validationFailedEvent = await recordSubscriptionEvent({
          supabaseAdmin,
          subscription: currentSubscription,
          businessId: business_id,
          provider: eventProvider,
          providerEventId: accountCancellationValidationFailedEventId,
          providerSubscriptionId,
          eventType: "account.cancellation_validation_failed",
          occurredAt: requestedAt,
          payload: { ...requestPayload, failure_reason: "closure_candidate_missing" },
          transitionAction: "ACCOUNT_CANCELLATION_VALIDATION_FAILED",
        });

        if (!validationFailedEvent.ok) {
          logError("Error recording account cancellation validation failure:", validationFailedEvent.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_VALIDATION_AUDIT_FAILED",
              message: "Error al registrar la validación de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "ACCOUNT_CANCELLATION_NO_CLOSURE_CANDIDATE",
            message: "No encontramos una suscripción activa para programar la baja automática de cuenta.",
          }),
          {
            status: 409,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const existingRequest = isAccountCancellation
        ? accountCancellationEvents?.data.scheduled ?? null
        : (await lookupSubscriptionEvent({
          supabaseAdmin,
          provider: eventProvider,
          providerEventId: cancellationRequestProviderEventId,
        })).data;

      if (existingRequest) {
        if (isAccountCancellation) {
          return await buildScheduledAccountCancellationResponse({
            supabaseAdmin,
            currentSubscription,
            scheduledAt: existingRequest.occurred_at,
            requestedAt,
            paidThroughDate,
            reason,
            corsHeaders,
            needsProviderCancellation,
            hasProviderCancelledEvidence: Boolean(accountCancellationEvents?.data.providerCancelled),
            logError,
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            message: "Solicitud de baja ya recibida. La vamos a procesar manualmente antes del próximo ciclo de facturación.",
            request: {
              status: "already_requested",
              requested_at: existingRequest.occurred_at,
              reason: reason || "manual_request",
            },
            subscription: buildSubscriptionResponse(currentSubscription, {
              includeProviderSubscriptionId: true,
            }),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (needsPaidThroughAccess && !paidThroughDate) {
        const validationFailedEvent = await recordSubscriptionEvent({
          supabaseAdmin,
          subscription: currentSubscription,
          businessId: business_id,
          provider: eventProvider,
          providerEventId: accountCancellationValidationFailedEventId,
          providerSubscriptionId,
          eventType: "account.cancellation_validation_failed",
          occurredAt: requestedAt,
          payload: { ...requestPayload, failure_reason: "paid_through_missing" },
          transitionAction: "ACCOUNT_CANCELLATION_VALIDATION_FAILED",
        });

        if (!validationFailedEvent.ok) {
          logError("Error recording account cancellation validation failure:", validationFailedEvent.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_VALIDATION_AUDIT_FAILED",
              message: "Error al registrar la falla de validación de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "ACCOUNT_CANCELLATION_PAID_THROUGH_MISSING",
            message: "No pudimos calcular hasta cuándo mantener el acceso pago",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (needsProviderCancellation && !providerSubscriptionId) {
        const validationFailedEvent = await recordSubscriptionEvent({
          supabaseAdmin,
          subscription: currentSubscription,
          businessId: business_id,
          provider: eventProvider,
          providerEventId: accountCancellationValidationFailedEventId,
          providerSubscriptionId,
          eventType: "account.cancellation_validation_failed",
          occurredAt: requestedAt,
          payload: { ...requestPayload, failure_reason: "provider_subscription_id_missing" },
          transitionAction: "ACCOUNT_CANCELLATION_VALIDATION_FAILED",
        });

        if (!validationFailedEvent.ok) {
          logError("Error recording account cancellation validation failure:", validationFailedEvent.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_VALIDATION_AUDIT_FAILED",
              message: "Error al registrar la falla de validación de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        return new Response(
          JSON.stringify({
            error: "ACCOUNT_CANCELLATION_PROVIDER_ID_MISSING",
            message: "No pudimos identificar la suscripción de Mercado Pago para cancelar la renovación",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (
        isAccountCancellation &&
        needsProviderCancellation &&
        !accountCancellationEvents?.data.providerCancelled &&
        !accountCancellationEvents?.data.scheduled &&
        (accountCancellationEvents?.data.requested || accountCancellationEvents?.data.providerFailed)
      ) {
        const retryStartedEvent = await recordSubscriptionEvent({
          supabaseAdmin,
          subscription: currentSubscription,
          businessId: business_id,
          provider: eventProvider,
          providerEventId: accountCancellationRetryStartedEventId,
          providerSubscriptionId,
          eventType: "account.cancellation_retry_started",
          occurredAt: requestedAt,
          payload: requestPayload,
          transitionAction: "ACCOUNT_CANCELLATION_RETRY_STARTED",
        });

        if (!retryStartedEvent.ok) {
          logError("Error recording account cancellation retry lock:", retryStartedEvent.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_RETRY_LOCK_FAILED",
              message: "Error al iniciar el reintento de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        if (retryStartedEvent.duplicate) {
          const refreshedEvents = await lookupExistingAccountCancellationEvents({
            supabaseAdmin,
            provider: eventProvider,
            requestedEventId: cancellationRequestProviderEventId,
            providerCancelledEventId: accountCancellationProviderCancelledEventId,
            scheduledEventId: accountCancellationScheduledEventId,
            providerFailedEventId: accountCancellationFailureEventId,
            validationFailedEventId: accountCancellationValidationFailedEventId,
            retryStartedEventId: accountCancellationRetryStartedEventId,
          });

          if (refreshedEvents.error) {
            logError("Error looking up duplicate account cancellation retry state:", refreshedEvents.error);
            return new Response(
              JSON.stringify({
                error: "ACCOUNT_CANCELLATION_STATE_LOOKUP_FAILED",
                message: "Error al verificar el estado de baja de cuenta",
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          accountCancellationEvents!.data = refreshedEvents.data;

          if (refreshedEvents.data.scheduled) {
            return await buildScheduledAccountCancellationResponse({
              supabaseAdmin,
              currentSubscription,
              scheduledAt: refreshedEvents.data.scheduled.occurred_at,
              requestedAt,
              paidThroughDate,
              reason,
              corsHeaders,
              needsProviderCancellation,
              hasProviderCancelledEvidence: Boolean(refreshedEvents.data.providerCancelled),
              logError,
            });
          }

          if (refreshedEvents.data.providerCancelled) {
            // Same-bucket duplicate with provider-cancelled can safely continue to local scheduling below.
          } else if (refreshedEvents.data.providerFailed) {
            return new Response(
              JSON.stringify({
                error: "ACCOUNT_CANCELLATION_PROVIDER_PREVIOUSLY_FAILED",
                message: "La baja de cuenta ya tuvo una falla al cancelar la renovación en Mercado Pago",
                request: {
                  status: "provider_failed",
                  requested_at: refreshedEvents.data.providerFailed.occurred_at,
                  reason: reason || "manual_request",
                },
              }),
              {
                status: 502,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          } else {
            return new Response(
              JSON.stringify({
                error: "ACCOUNT_CANCELLATION_IN_PROGRESS",
                message: "La baja de cuenta ya está en proceso y todavía no fue programada",
                request: {
                  status: "in_progress",
                  requested_at: refreshedEvents.data.retryStarted?.occurred_at || requestedAt,
                  reason: reason || "manual_request",
                },
              }),
              {
                status: 409,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        const refreshedEvents = await lookupExistingAccountCancellationEvents({
          supabaseAdmin,
          provider: eventProvider,
          requestedEventId: cancellationRequestProviderEventId,
          providerCancelledEventId: accountCancellationProviderCancelledEventId,
          scheduledEventId: accountCancellationScheduledEventId,
          providerFailedEventId: accountCancellationFailureEventId,
          validationFailedEventId: accountCancellationValidationFailedEventId,
          retryStartedEventId: accountCancellationRetryStartedEventId,
        });

        if (refreshedEvents.error) {
          logError("Error looking up account cancellation state after retry lock:", refreshedEvents.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_STATE_LOOKUP_FAILED",
              message: "Error al verificar el estado de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        accountCancellationEvents!.data = refreshedEvents.data;

        if (refreshedEvents.data.scheduled) {
          return await buildScheduledAccountCancellationResponse({
            supabaseAdmin,
            currentSubscription,
            scheduledAt: refreshedEvents.data.scheduled.occurred_at,
            requestedAt,
            paidThroughDate,
            reason,
            corsHeaders,
            needsProviderCancellation,
            hasProviderCancelledEvidence: Boolean(refreshedEvents.data.providerCancelled),
            logError,
          });
        }
      }

      const requestedEvent = isAccountCancellation && accountCancellationEvents?.data.requested
        ? { ok: true as const, duplicate: true }
        : await recordSubscriptionEvent({
          supabaseAdmin,
          subscription: currentSubscription,
          businessId: business_id,
          provider: eventProvider,
          providerEventId: cancellationRequestProviderEventId,
          providerSubscriptionId,
          eventType: isAccountCancellation
            ? "account.cancellation_requested"
            : "subscription.cancellation_requested",
          occurredAt: requestedAt,
          payload: requestPayload,
          transitionAction: isAccountCancellation
            ? "REQUEST_ACCOUNT_CANCELLATION"
            : "REQUEST_MANUAL_CANCELLATION",
        });

      if (!requestedEvent.ok) {
        logError("Error recording cancellation request:", requestedEvent.error);
        return new Response(
          JSON.stringify({
            error: "CANCELLATION_REQUEST_FAILED",
            message: "Error al registrar solicitud de baja",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (isAccountCancellation && requestedEvent.duplicate && !accountCancellationEvents?.data.requested) {
        const refreshedEvents = await lookupExistingAccountCancellationEvents({
          supabaseAdmin,
          provider: eventProvider,
          requestedEventId: cancellationRequestProviderEventId,
          providerCancelledEventId: accountCancellationProviderCancelledEventId,
          scheduledEventId: accountCancellationScheduledEventId,
          providerFailedEventId: accountCancellationFailureEventId,
          validationFailedEventId: accountCancellationValidationFailedEventId,
          retryStartedEventId: accountCancellationRetryStartedEventId,
        });

        if (refreshedEvents.error) {
          logError("Error looking up duplicate account cancellation state:", refreshedEvents.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_STATE_LOOKUP_FAILED",
              message: "Error al verificar el estado de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        accountCancellationEvents!.data = refreshedEvents.data;

        if (refreshedEvents.data.scheduled) {
          return await buildScheduledAccountCancellationResponse({
            supabaseAdmin,
            currentSubscription,
            scheduledAt: refreshedEvents.data.scheduled.occurred_at,
            requestedAt,
            paidThroughDate,
            reason,
            corsHeaders,
            needsProviderCancellation,
            hasProviderCancelledEvidence: Boolean(refreshedEvents.data.providerCancelled),
            logError,
          });
        }

        if (
          refreshedEvents.data.requested &&
          !refreshedEvents.data.providerCancelled &&
          !refreshedEvents.data.scheduled &&
          !refreshedEvents.data.validationFailed
        ) {
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_IN_PROGRESS",
              message: "La baja de cuenta ya está en proceso y todavía no fue programada",
              request: {
                status: "in_progress",
                requested_at: refreshedEvents.data.requested.occurred_at,
                reason: reason || "manual_request",
              },
            }),
            {
              status: 409,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      if (!isAccountCancellation) {
        const duplicateRequestedAt = requestedEvent.duplicate
          ? (await supabaseAdmin
            .from("subscription_events")
            .select("occurred_at")
            .eq("provider", eventProvider)
            .eq("provider_event_id", cancellationRequestProviderEventId)
            .order("occurred_at", { ascending: false })
            .limit(1)
            .maybeSingle()).data?.occurred_at || null
          : null;

        return new Response(
          JSON.stringify({
            success: true,
            message: requestedEvent.duplicate
              ? "Solicitud de baja ya recibida. La vamos a procesar manualmente antes del próximo ciclo de facturación."
              : "Solicitud de baja recibida. La vamos a procesar manualmente con soporte y Mercado Pago antes del próximo ciclo de facturación.",
            request: {
              status: requestedEvent.duplicate ? "already_requested" : "manual_review",
              requested_at: requestedEvent.duplicate ? duplicateRequestedAt : requestedAt,
              reason: reason || "manual_request",
            },
            subscription: buildSubscriptionResponse(currentSubscription, {
              includeProviderSubscriptionId: true,
            }),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (needsProviderCancellation && providerSubscriptionId && !accountCancellationEvents?.data.providerCancelled) {
        const mpAccessToken = envGet("MP_ACCESS_TOKEN");
        if (!mpAccessToken) {
          const failureEvent = await recordSubscriptionEvent({
            supabaseAdmin,
            subscription: currentSubscription,
            businessId: business_id,
            provider: eventProvider,
            providerEventId: accountCancellationFailureEventId,
            providerSubscriptionId,
            eventType: "account.cancellation_provider_failed",
            occurredAt: now().toISOString(),
            payload: { ...requestPayload, failure_reason: "mp_access_token_missing" },
            transitionAction: "ACCOUNT_CANCELLATION_PROVIDER_FAILED",
          });

          if (!failureEvent.ok) {
            logError("Error recording provider cancellation failure:", failureEvent.error);
            return new Response(
              JSON.stringify({
                error: "ACCOUNT_CANCELLATION_PROVIDER_FAILURE_AUDIT_FAILED",
                message: "Error al registrar la falla de baja de cuenta",
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          return new Response(
            JSON.stringify({
              error: "MP_CONFIG_ERROR",
              message: "Mercado Pago no configurado en el servidor",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const providerCancellation = await cancelMercadoPagoRenewal({
          providerSubscriptionId,
          accessToken: mpAccessToken,
          fetchFn,
          sleepFn,
          timeoutMs: mpCancelAttemptTimeoutMs,
        });

        if (!providerCancellation.ok) {
          const failureEvent = await recordSubscriptionEvent({
            supabaseAdmin,
            subscription: currentSubscription,
            businessId: business_id,
            provider: eventProvider,
            providerEventId: accountCancellationFailureEventId,
            providerSubscriptionId,
            eventType: "account.cancellation_provider_failed",
            occurredAt: now().toISOString(),
            payload: {
              ...requestPayload,
              failure_reason: providerCancellation.status
                ? `mp_http_${providerCancellation.status}`
                : "mp_network_error",
            },
            transitionAction: "ACCOUNT_CANCELLATION_PROVIDER_FAILED",
          });

          if (!failureEvent.ok) {
            logError("Error recording provider cancellation failure:", failureEvent.error);
            return new Response(
              JSON.stringify({
                error: "ACCOUNT_CANCELLATION_PROVIDER_FAILURE_AUDIT_FAILED",
                message: "Error al registrar la falla de baja de cuenta",
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }

          logError("Mercado Pago renewal cancellation failed", {
            status: providerCancellation.status,
          });
          return new Response(
            JSON.stringify({
              error: "MP_CANCEL_FAILED",
              message: "No pudimos cancelar la renovación en Mercado Pago",
            }),
            {
              status: 502,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }

        const providerSuccessEvent = await recordSubscriptionEvent({
          supabaseAdmin,
          subscription: currentSubscription,
          businessId: business_id,
          provider: eventProvider,
          providerEventId: accountCancellationProviderCancelledEventId,
          providerSubscriptionId,
          eventType: "account.cancellation_provider_cancelled",
          occurredAt: now().toISOString(),
          payload: { ...requestPayload, provider_status: "cancelled" },
          transitionAction: "ACCOUNT_CANCELLATION_PROVIDER_CANCELLED",
        });

        if (!providerSuccessEvent.ok) {
          logError("Error recording provider cancellation success:", providerSuccessEvent.error);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_PROVIDER_SUCCESS_AUDIT_FAILED",
              message: "Error al registrar la cancelación de renovación en Mercado Pago",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      const scheduledEvent = await recordSubscriptionEvent({
        supabaseAdmin,
        subscription: currentSubscription,
        businessId: business_id,
        provider: eventProvider,
        providerEventId: accountCancellationScheduledEventId,
        providerSubscriptionId,
        eventType: "account.cancellation_scheduled",
        occurredAt: now().toISOString(),
        payload: needsProviderCancellation
          ? { ...requestPayload, provider_status: "cancelled" }
          : requestPayload,
        transitionAction: "SCHEDULE_ACCOUNT_CANCELLATION",
      });

      if (!scheduledEvent.ok) {
        logError("Error recording scheduled account cancellation:", scheduledEvent.error);
        return new Response(
          JSON.stringify({
            error: "ACCOUNT_CANCELLATION_SCHEDULE_FAILED",
            message: "Error al registrar la programación de baja de cuenta",
          }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      if (currentSubscription) {
        const { error: subscriptionUpdateError } = await updateAccountCancellationSubscriptionState({
          supabaseAdmin,
          subscription: currentSubscription,
          timestamp: requestedAt,
        });

        if (subscriptionUpdateError) {
          logError("Error recording account cancellation subscription state:", subscriptionUpdateError);
          return new Response(
            JSON.stringify({
              error: "ACCOUNT_CANCELLATION_STATE_FAILED",
              message: "Error al registrar el estado de baja de cuenta",
            }),
            {
              status: 500,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            },
          );
        }
      }

      // =============================================================================
      // 6. RETURN RESPONSE WITHOUT TERMINATING LOCAL PAID-THROUGH ACCESS
      // =============================================================================
      return new Response(
        JSON.stringify({
          success: true,
          message: "Baja de cuenta solicitada. Cancelamos la renovación y mantenemos el acceso hasta el final del período pago.",
          account_closure_at: paidThroughDate,
          request: {
            status: "scheduled_account_closure",
            requested_at: requestedAt,
            reason: reason || "manual_request",
          },
          subscription: buildSubscriptionResponse(currentSubscription),
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } catch (error) {
      logError("Unexpected error:", error);
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
  };
}

export const handleCancelSubscription = createCancelSubscriptionHandler();

if (import.meta.main) {
  Deno.serve(handleCancelSubscription);
}
