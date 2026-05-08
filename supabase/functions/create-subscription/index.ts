// create-subscription Edge Function
// Creates a Mercado Pago preapproval subscription
// Endpoint: POST /functions/v1/create-subscription

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";
import { normalizeCadence, normalizeTier, resolvePlanCatalogRow } from "../_shared/mp-plan-catalog.ts";
import { evaluatePreapprovalPlanRollout } from "../_shared/mp-rollout-control.ts";
import { recordPreapprovalCreateMetric } from "../_shared/mp-rollout-observability.ts";

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
const MP_PREAPPROVAL_ENDPOINT = "/preapproval";

function normalizePlanCode(planCode: string): string {
  return planCode.trim().toUpperCase();
}

interface Plan {
  id: string;
  code: string;
  name: string;
  price: number;
  currency: string;
  billing_frequency: number;
  billing_frequency_type: string;
}

interface SubscriptionRequest {
  plan_code: string;
  tier?: string;
  cadence?: string;
  card_token_id?: string;
  preapproval_plan_id?: string;
  email?: string;
}

function isStrictAssociatedPlanModeEnabled(): boolean {
  return (Deno.env.get("MP_ASSOCIATED_PLAN_STRICT_MODE") || "false").toLowerCase() === "true";
}

function hasValidCardTokenIdFormat(value: string): boolean {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function hasValidPreapprovalPlanIdFormat(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,128}$/.test(value);
}

function resolvePreapprovalPlanId(plan: Plan, bodyPlanId?: string): string | null {
  if (typeof bodyPlanId === "string" && bodyPlanId.trim().length > 0) return bodyPlanId.trim();

  const planRecord = plan as unknown as Record<string, unknown>;
  const planCandidates = [
    planRecord.mercado_pago_monthly_plan_id,
    planRecord.mercado_pago_plan_id,
    planRecord.mercado_pago_quarterly_plan_id,
    planRecord.mercado_pago_annual_plan_id,
  ];

  for (const candidate of planCandidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }

  const envDefault = Deno.env.get("MP_PREAPPROVAL_PLAN_ID");
  return envDefault && envDefault.trim().length > 0 ? envDefault.trim() : null;
}

function sanitizeDiagnosticText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  const trimmed = value.replace(/[\r\n\t]+/g, " ").trim();
  if (!trimmed) return undefined;

  return trimmed.slice(0, 240);
}

function sanitizeMercadoPagoError(errorText: string, status: number): {
  provider: "mercado_pago";
  status: number;
  code?: string;
  message?: string;
} {
  const fallback = {
    provider: "mercado_pago" as const,
    status,
    message: sanitizeDiagnosticText(errorText) || "Mercado Pago rejected the preapproval request",
  };

  try {
    const parsed = JSON.parse(errorText) as Record<string, unknown>;
    const cause = Array.isArray(parsed.cause) ? parsed.cause[0] as Record<string, unknown> | undefined : undefined;

    return {
      provider: "mercado_pago",
      status,
      code: sanitizeDiagnosticText(parsed.error) || sanitizeDiagnosticText(parsed.status) || sanitizeDiagnosticText(cause?.code),
      message:
        sanitizeDiagnosticText(parsed.message) ||
        sanitizeDiagnosticText(cause?.description) ||
        sanitizeDiagnosticText(cause?.message) ||
        fallback.message,
    };
  } catch {
    return fallback;
  }
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function createOpaqueCheckoutToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((byte) => byte.toString(16).padStart(2, "0")).join("");
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

  try {
    // =============================================================================
    // 1. VERIFY USER AUTHENTICATION (Optional for anonymous checkout)
    // =============================================================================
    const authHeader = req.headers.get("Authorization");
    let user = null;
    let business = null;

    // Create Supabase client with admin privileges to bypass RLS
    const supabaseAdmin = createClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY")
    );

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      
      // Verify JWT and get user
      const { data: { user: authUser }, error: authError } = await supabaseAdmin.auth.getUser(token);
      if (authError || !authUser) {
        return new Response(
          JSON.stringify({ error: "INVALID_TOKEN", message: "Token inválido o expirado" }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      user = authUser;

      // =============================================================================
      // 2. GET USER'S BUSINESS
      // =============================================================================
      const { data: businessData, error: businessError } = await supabaseAdmin
        .from("businesses")
        .select("id, name, owner_id")
        .eq("owner_id", user.id)
        .single();

      if (!businessError && businessData) {
        business = businessData;
      } else if (user) {
        // Auto-create basic business if user exists but has no business yet
        const slug = `mi-negocio-${Date.now()}`;
        const { data: newBusiness, error: createBusinessError } = await supabaseAdmin
          .from("businesses")
          .insert({
            name: "Mi Negocio",
            slug: slug,
            owner_id: user.id,
            timezone: "America/Argentina/Buenos_Aires",
            is_active: true,
          })
          .select("id, name, owner_id")
          .single();

        if (!createBusinessError && newBusiness) {
          business = newBusiness;
          console.log("Auto-created business for user:", user.id);
        }
      }
    }

    // =============================================================================
    // 3. PARSE AND VALIDATE REQUEST
    // =============================================================================
    let body: SubscriptionRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "INVALID_JSON", message: "Cuerpo de solicitud inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { plan_code, tier, cadence, card_token_id, preapproval_plan_id } = body;

    let effectivePlanCode: string | null = typeof plan_code === "string" ? plan_code : null;
    let catalogRow: { id: string; tier: string; cadence: string; tier_code: string; preapproval_plan_id: string } | null = null;

    if ((!effectivePlanCode || effectivePlanCode.trim().length === 0) && typeof tier === "string" && typeof cadence === "string") {
      const normalizedTier = normalizeTier(tier);
      const normalizedCadence = normalizeCadence(cadence);

      if (!normalizedTier || !normalizedCadence) {
        return new Response(
          JSON.stringify({ error: "INVALID_TIER_OR_CADENCE", message: "tier/cadence inválidos" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const { data: catalogRows, error: catalogError } = await supabaseAdmin
        .from("mp_plan_catalog")
        .select("id, tier, cadence, tier_code, preapproval_plan_id")
        .eq("tier", normalizedTier)
        .eq("cadence", normalizedCadence)
        .limit(1);

      if (catalogError) {
        return new Response(
          JSON.stringify({ error: "PLAN_CATALOG_READ_FAILED", message: "No se pudo leer mp_plan_catalog" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const resolved = resolvePlanCatalogRow(catalogRows ?? [], normalizedTier, normalizedCadence);
      if (!resolved || !resolved.preapproval_plan_id) {
        return new Response(
          JSON.stringify({ error: "PREAPPROVAL_PLAN_NOT_SYNCED", message: "Plan no sincronizado con Mercado Pago" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      catalogRow = {
        id: String(resolved.id),
        tier: String(resolved.tier),
        cadence: String(resolved.cadence),
        tier_code: String(resolved.tier_code),
        preapproval_plan_id: String(resolved.preapproval_plan_id),
      };

      effectivePlanCode = normalizedTier === "started" ? "STARTER" : normalizedTier === "medium" ? "GROWTH" : "PRO";
    }

    if (!effectivePlanCode || typeof effectivePlanCode !== "string") {
      return new Response(
        JSON.stringify({ error: "PLAN_CODE_REQUIRED", message: "El campo plan_code o {tier,cadence} es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const canonicalPlanCode = normalizePlanCode(effectivePlanCode);

    // =============================================================================
    // 4. GET PLAN FROM DATABASE (NOT FROM REQUEST)
    // =============================================================================
    const { data: plan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("code", canonicalPlanCode)
      .eq("is_active", true)
      .single();

    if (planError || !plan) {
      return new Response(
        JSON.stringify({ 
          error: "PLAN_NOT_FOUND", 
          message: `Plan '${canonicalPlanCode}' no encontrado o inactivo` 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Free plan doesn't need Mercado Pago
    if (plan.price === 0) {
      if (!business) {
        return new Response(
          JSON.stringify({ error: "BUSINESS_REQUIRED", message: "Se requiere un negocio para activar el plan gratuito" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      // Create free subscription directly
      const now = new Date();
      const periodEnd = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);
      
      const { data: subscription, error: subError } = await supabaseAdmin
        .from("business_subscriptions")
        .insert({
          business_id: business.id,
          tenant_id: business.owner_id,
          plan_code: plan.code,
          status: "active",
          period_start: now.toISOString(),
          period_end: periodEnd.toISOString(),
          start_date: now.toISOString(),
          next_billing_date: periodEnd.toISOString(),
          mp_preapproval_status: "active",
        })
        .select()
        .single();

      if (subError) {
        return new Response(
          JSON.stringify({ error: "SUBSCRIPTION_FAILED", message: "Error al crear suscripción gratuita" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          success: true,
          subscription: subscription,
          init_point: null,
          message: "Suscripción gratuita activada",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 5. CREATE MERCADO PAGO PREAPPROVAL
    // =============================================================================
    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    if (!mpAccessToken) {
      return new Response(
        JSON.stringify({ error: "MP_CONFIG_ERROR", message: "Mercado Pago no configurado en el servidor" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate billing dates
    const now = new Date();
    const nextBillingDate = new Date(now.getTime() + plan.duration_days * 24 * 60 * 60 * 1000);

    if (!business) {
      return new Response(
        JSON.stringify({ error: "BUSINESS_REQUIRED", message: "Se requiere un negocio para crear checkout de suscripción" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rolloutDecision = evaluatePreapprovalPlanRollout({
      tenantId: business.owner_id,
      userId: user?.id || business.owner_id,
      environment: (Deno.env.get("DENO_ENV") as "development" | "staging" | "production" | undefined) || "production",
    });

    if (!rolloutDecision.allowed) {
      recordPreapprovalCreateMetric({
        tenantId: business.owner_id,
        userId: user?.id || business.owner_id,
        rolloutPercent: rolloutDecision.rolloutPercent,
        rolloutBucket: rolloutDecision.bucket,
        result: "blocked",
        retryable: false,
        idempotencyDecision: "not_applicable",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: 503,
      });

      return new Response(
        JSON.stringify({
          error: "ROLLOUT_BLOCKED",
          message: "Mercado Pago subscription flow temporarily unavailable for this tenant during canary rollout",
          rollout_percent: rolloutDecision.rolloutPercent,
        }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const checkoutToken = createOpaqueCheckoutToken();
    const externalReference = `checkout-session:${checkoutToken}`;
    const checkoutExpiresAt = new Date(now.getTime() + 30 * 60 * 1000);

    const { data: checkoutSession, error: checkoutError } = await supabaseAdmin
      .from("billing_checkout_sessions")
      .insert({
        tenant_id: business.owner_id,
        business_id: business.id,
        plan_code: plan.code,
        expected_amount: plan.price,
        expected_currency: plan.currency,
        provider: "mercado_pago",
        external_reference: externalReference,
        token_hash: await sha256Text(checkoutToken),
        expires_at: checkoutExpiresAt.toISOString(),
        created_by: user?.id || business.owner_id,
      })
      .select("id, external_reference")
      .single();

    if (checkoutError || !checkoutSession) {
      console.error("Checkout session insert error:", checkoutError?.message);
      return new Response(
        JSON.stringify({ error: "CHECKOUT_SESSION_FAILED", message: "Error al crear sesión segura de checkout" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build MP preapproval request
    const payerEmail = user?.email || (body as any).email;
    if (!payerEmail) {
      return new Response(
        JSON.stringify({ error: "EMAIL_REQUIRED", message: "Se requiere un email para procesar el pago" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const strictAssociatedPlanMode = false;
    const resolvedPreapprovalPlanId = catalogRow?.preapproval_plan_id || resolvePreapprovalPlanId(plan, preapproval_plan_id);

    if (strictAssociatedPlanMode && (!card_token_id || card_token_id.trim().length === 0)) {
      return new Response(
        JSON.stringify({ error: "CARD_TOKEN_ID_REQUIRED", message: "card_token_id es requerido en modo estricto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedCardTokenId = card_token_id?.trim();
    if (strictAssociatedPlanMode && normalizedCardTokenId && !hasValidCardTokenIdFormat(normalizedCardTokenId)) {
      return new Response(
        JSON.stringify({ error: "CARD_TOKEN_ID_INVALID_FORMAT", message: "card_token_id tiene un formato inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (strictAssociatedPlanMode && !resolvedPreapprovalPlanId) {
      return new Response(
        JSON.stringify({ error: "PREAPPROVAL_PLAN_ID_REQUIRED", message: "preapproval_plan_id es requerido en modo estricto" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (strictAssociatedPlanMode && resolvedPreapprovalPlanId && !hasValidPreapprovalPlanIdFormat(resolvedPreapprovalPlanId)) {
      return new Response(
        JSON.stringify({ error: "PREAPPROVAL_PLAN_ID_INVALID_FORMAT", message: "preapproval_plan_id tiene un formato inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let mpPreapprovalRequest: Record<string, unknown>;
    if (strictAssociatedPlanMode) {
      mpPreapprovalRequest = {
        payer_email: payerEmail,
        back_url: `${Deno.env.get("FRONTEND_URL") || "https://app.salon-de-belleza.com"}/auth/signup/credentials?plan=${plan.code}`,
        reason: `${plan.name} - Orvel`,
        external_reference: externalReference,
        preapproval_plan_id: resolvedPreapprovalPlanId,
        card_token_id: normalizedCardTokenId!,
        status: "authorized",
      };
    } else {
      mpPreapprovalRequest = {
        payer_email: payerEmail,
        back_url: `${Deno.env.get("FRONTEND_URL") || "https://app.salon-de-belleza.com"}/auth/signup/credentials?plan=${plan.code}`,
        reason: `${plan.name} - Orvel`,
        external_reference: externalReference,
        auto_recurring: {
          frequency: plan.billing_frequency,
          frequency_type: plan.billing_frequency_type,
          transaction_amount: plan.price,
          currency_id: plan.currency,
          start_date: now.toISOString(),
          end_date: nextBillingDate.toISOString(),
        },
      };
    }

    // Create preapproval in Mercado Pago
    const mpResponse = await fetch(`${MP_API_BASE}/preapproval`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mpAccessToken}`,
      },
      body: JSON.stringify(mpPreapprovalRequest),
    });

    if (!mpResponse.ok) {
      const errorText = await mpResponse.text();
      const upstreamError = sanitizeMercadoPagoError(errorText, mpResponse.status);
      recordPreapprovalCreateMetric({
        tenantId: business.owner_id,
        userId: user?.id || business.owner_id,
        rolloutPercent: rolloutDecision.rolloutPercent,
        rolloutBucket: rolloutDecision.bucket,
        result: "error",
        retryable: mpResponse.status >= 500 || mpResponse.status === 429,
        idempotencyDecision: "not_applicable",
        latencyMs: Date.now() - requestStartedAt,
        httpStatus: mpResponse.status,
      });
      console.error("Mercado Pago API Error", {
        status: mpResponse.status,
        mode: strictAssociatedPlanMode ? "strict" : "legacy",
        responseSize: errorText.length,
        upstream_error: upstreamError,
      });
      return new Response(
        JSON.stringify({
          error: "MP_API_ERROR",
          message: "Error al crear pre-aprobación en Mercado Pago",
          upstream_error: upstreamError,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const mpData = await mpResponse.json();

    if (!mpData.id || !mpData.init_point) {
      return new Response(
        JSON.stringify({ error: "MP_INVALID_RESPONSE", message: "Respuesta inválida de Mercado Pago" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    await supabaseAdmin
      .from("billing_checkout_sessions")
      .update({
        provider_preference_id: mpData.id,
        provider_resource_id: mpData.id,
        provider_plan_id: mpData.preapproval_plan_id || mpData.preapproval_plan?.id || null,
        status: "provider_created",
      })
      .eq("id", checkoutSession.id);

    // =============================================================================
    // 6. SAVE PENDING SUBSCRIPTION (Only if business exists)
    // =============================================================================
    let subscriptionId = null;
    if (business) {
      const { data: subscription, error: subError } = await supabaseAdmin
        .from("business_subscriptions")
        .insert({
          business_id: business.id,
          tenant_id: business.owner_id,
          plan_code: plan.code,
          status: "pending",
          period_start: now.toISOString(),
          period_end: null, // Will be set when MP confirms payment
          current_period_start: now.toISOString(),
          current_period_end: null,
          provider: "mercado_pago",
          provider_subscription_id: mpData.id,
          provider_plan_id: mpData.preapproval_plan_id || mpData.preapproval_plan?.id || null,
          mp_preapproval_id: mpData.id,
          mp_preapproval_plan_id: mpData.preapproval_plan_id || mpData.preapproval_plan?.id || resolvedPreapprovalPlanId || null,
          mp_preapproval_status: mpData.status || "pending",
          mp_external_reference: externalReference,
          mp_init_point: mpData.init_point,
          mp_plan_catalog_id: catalogRow?.id || null,
          start_date: now.toISOString(),
          next_billing_date: nextBillingDate.toISOString(),
        })
        .select()
        .single();
  
      if (subError) {
        console.error("Subscription insert error:", subError);
        return new Response(
          JSON.stringify({ error: "SUBSCRIPTION_SAVE_FAILED", message: "Error al guardar suscripción" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      subscriptionId = subscription.id;
    }

    // =============================================================================
    // 7. RETURN INIT POINT TO FRONTEND
    // =============================================================================
    recordPreapprovalCreateMetric({
      tenantId: business.owner_id,
      userId: user?.id || business.owner_id,
      rolloutPercent: rolloutDecision.rolloutPercent,
      rolloutBucket: rolloutDecision.bucket,
      result: "success",
      retryable: false,
      idempotencyDecision: "not_applicable",
      latencyMs: Date.now() - requestStartedAt,
      httpStatus: 200,
    });

    return new Response(
      JSON.stringify({
        success: true,
        subscription: {
          id: subscriptionId,
          plan_code: plan.code,
          status: business ? "pending" : "anon_pending",
          mp_preapproval_id: mpData.id,
          external_reference: externalReference,
        },
        init_point: mpData.init_point,
        message: "_redirect_to_mercadopago",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    recordPreapprovalCreateMetric({
      tenantId: "unknown",
      userId: "unknown",
      rolloutPercent: 100,
      rolloutBucket: 0,
      result: "error",
      retryable: true,
      idempotencyDecision: "not_applicable",
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
