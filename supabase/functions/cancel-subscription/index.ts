// cancel-subscription Edge Function
// Records manual subscription cancellation requests for MVP support processing.
// Endpoint: POST /functions/v1/cancel-subscription

import { createClient } from "@supabase/supabase-js";
import {
  getBillingCorsHeaders,
  rejectDisallowedBrowserOrigin,
  requireServerSecret,
} from "../_shared/billing-security.ts";

const RATE_LIMIT_MAX_REQUESTS = 10;
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
}

interface CancelSubscriptionHandlerDependencies {
  createSupabaseAdminClient?: () => any;
  getCorsHeaders?: (req: Request) => Record<string, string>;
  rejectDisallowedOrigin?: (req: Request) => Response | null;
  isRateLimitedRequest?: (req: Request) => boolean;
  now?: () => Date;
  logError?: (...args: unknown[]) => void;
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
        .in("status", ["active", "pending"])
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (subError || !currentSubscription) {
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
      // 5. RECORD MANUAL CANCELLATION REQUEST
      // =============================================================================
      const requestedAt = now().toISOString();
      const providerSubscriptionId =
        currentSubscription.provider_subscription_id ||
        currentSubscription.mp_preapproval_id ||
        null;
      const eventProvider = "orvel_manual";
      const cancellationRequestProviderEventId =
        `manual-cancel-request:${currentSubscription.id}`;

      const { data: existingRequest } = await supabaseAdmin
        .from("subscription_events")
        .select("occurred_at")
        .eq("provider", eventProvider)
        .eq("provider_event_id", cancellationRequestProviderEventId)
        .order("occurred_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existingRequest) {
        return new Response(
          JSON.stringify({
            success: true,
            message:
              "Solicitud de baja ya recibida. La vamos a procesar manualmente antes del próximo ciclo de facturación.",
            request: {
              status: "already_requested",
              requested_at: existingRequest.occurred_at,
              reason: reason || "manual_request",
            },
            subscription: {
              id: currentSubscription.id,
              status: currentSubscription.status,
              plan_code: currentSubscription.plan_code,
              provider_subscription_id: providerSubscriptionId,
              period_end: currentSubscription.period_end ||
                currentSubscription.current_period_end || null,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const payload = {
        business_id,
        reason: reason || "manual_request",
        requested_by: user.id,
        requested_at: requestedAt,
        provider_subscription_id: providerSubscriptionId,
        mode: "manual_support_processing",
      };

      const { error: eventError } = await supabaseAdmin
        .from("subscription_events")
        .insert({
          tenant_id: currentSubscription.tenant_id || business_id,
          business_id,
          subscription_id: currentSubscription.id,
          provider: eventProvider,
          provider_event_id: cancellationRequestProviderEventId,
          provider_subscription_id: providerSubscriptionId,
          event_type: "subscription.cancellation_requested",
          occurred_at: requestedAt,
          payload_hash: `sha256:${await sha256Hex(JSON.stringify(payload))}`,
          transition_action: "REQUEST_MANUAL_CANCELLATION",
          previous_status: currentSubscription.status,
          next_status: currentSubscription.status,
          previous_version: currentSubscription.version ?? null,
          next_version: currentSubscription.version ?? null,
        });

      if (eventError?.code === "23505") {
        const { data: duplicateRequest } = await supabaseAdmin
          .from("subscription_events")
          .select("occurred_at")
          .eq("provider", eventProvider)
          .eq("provider_event_id", cancellationRequestProviderEventId)
          .order("occurred_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return new Response(
          JSON.stringify({
            success: true,
            message:
              "Solicitud de baja ya recibida. La vamos a procesar manualmente antes del próximo ciclo de facturación.",
            request: {
              status: "already_requested",
              requested_at: duplicateRequest?.occurred_at || null,
              reason: reason || "manual_request",
            },
            subscription: {
              id: currentSubscription.id,
              status: currentSubscription.status,
              plan_code: currentSubscription.plan_code,
              provider_subscription_id: providerSubscriptionId,
              period_end: currentSubscription.period_end ||
                currentSubscription.current_period_end || null,
            },
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (eventError) {
        logError("Error recording cancellation request:", eventError);
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

      // =============================================================================
      // 6. RETURN RESPONSE WITHOUT MUTATING PROVIDER OR LOCAL SUBSCRIPTION STATUS
      // =============================================================================
      return new Response(
        JSON.stringify({
          success: true,
          message:
            "Solicitud de baja recibida. La vamos a procesar manualmente con soporte y Mercado Pago antes del próximo ciclo de facturación.",
          request: {
            status: "manual_review",
            requested_at: requestedAt,
            reason: reason || "manual_request",
          },
          subscription: {
            id: currentSubscription.id,
            status: currentSubscription.status,
            plan_code: currentSubscription.plan_code,
            provider_subscription_id: providerSubscriptionId,
            period_end: currentSubscription.period_end ||
              currentSubscription.current_period_end || null,
          },
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
