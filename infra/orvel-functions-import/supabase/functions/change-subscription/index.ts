// change-subscription Edge Function
// Handles plan upgrades/downgrades
// Endpoint: POST /functions/v1/change-subscription

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";
import { normalizeCadence, normalizeTier, resolvePlanCatalogRow } from "../_shared/mp-plan-catalog.ts";

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
  const normalized = planCode.trim().toUpperCase();

  if (normalized === 'FREE' || normalized === 'BASIC') {
    return 'STARTER';
  }

  if (normalized === 'MEDIUM') {
    return 'GROWTH';
  }

  return normalized;
}

interface ChangeSubscriptionRequest {
  business_id: string;
  new_plan_code: string;
  cadence?: string;
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
    // 1. VERIFY USER AUTHENTICATION
    // =============================================================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "AUTHORIZATION_REQUIRED", message: "Token de autenticación requerido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    
    // Create Supabase client with admin privileges to bypass RLS
    const supabaseAdmin = createClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY")
    );

    // Verify JWT and get user
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "INVALID_TOKEN", message: "Token inválido o expirado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 2. PARSE AND VALIDATE REQUEST
    // =============================================================================
    let body: ChangeSubscriptionRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "INVALID_JSON", message: "Cuerpo de solicitud inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { business_id, new_plan_code, cadence } = body;
    if (!business_id || typeof business_id !== "string") {
      return new Response(
        JSON.stringify({ error: "BUSINESS_ID_REQUIRED", message: "El campo business_id es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!new_plan_code || typeof new_plan_code !== "string") {
      return new Response(
        JSON.stringify({ error: "NEW_PLAN_CODE_REQUIRED", message: "El campo new_plan_code es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const canonicalNewPlanCode = normalizePlanCode(new_plan_code);

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
        JSON.stringify({ error: "BUSINESS_NOT_FOUND", message: "Negocio no encontrado o no te pertenece" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 4. GET CURRENT SUBSCRIPTION
    // =============================================================================
    const { data: currentSubscription, error: subError } = await supabaseAdmin
      .from("business_subscriptions")
      .select("*")
      .eq("business_id", business_id)
      .in("status", ["active", "pending", "cancelled", "canceled", "scheduled_change", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (subError || !currentSubscription) {
      return new Response(
        JSON.stringify({ error: "NO_SUBSCRIPTION", message: "No tienes una suscripción activa" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 5. GET NEW PLAN
    // =============================================================================
    const { data: newPlan, error: planError } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("code", canonicalNewPlanCode)
      .eq("is_active", true)
      .single();

    if (planError || !newPlan) {
      return new Response(
        JSON.stringify({ 
          error: "PLAN_NOT_FOUND", 
          message: `Plan '${canonicalNewPlanCode}' no encontrado o inactivo` 
        }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get current plan for comparison
    const { data: currentPlan } = await supabaseAdmin
      .from("plans")
      .select("*")
      .eq("code", normalizePlanCode(currentSubscription.plan_code))
      .single();

    // =============================================================================
    // 6. DETERMINE IF UPGRADE OR DOWNGRADE
    // =============================================================================
    const isUpgrade = newPlan.price > (currentPlan?.price || 0);
    const isDowngrade = newPlan.price < (currentPlan?.price || 0);
    const isFreePlan = newPlan.price === 0;

    // =============================================================================
    // 7. HANDLE CHANGE BASED ON PLAN TYPE
    // =============================================================================
    const now = new Date();
    let updateData: Record<string, unknown> = {
      plan_code: canonicalNewPlanCode,
      updated_at: now.toISOString(),
    };

    let initPoint: string | null = null;
    let message = "Plan cambiado exitosamente";

    // Case 1: Downgrading to free or cheaper plan
    if ((isDowngrade || isFreePlan) && currentSubscription.mp_preapproval_id) {
      updateData = {
        ...updateData,
        status: "scheduled_change",
        cancel_at_period_end: true,
      };

      const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
      if (mpAccessToken) {
        const cancelResponse = await fetch(`${MP_API_BASE}${MP_PREAPPROVAL_ENDPOINT}/${currentSubscription.mp_preapproval_id}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mpAccessToken}`,
          },
          body: JSON.stringify({ status: "cancelled" }),
        });

        if (!cancelResponse.ok) {
          console.error("Mercado Pago cancel/pause alignment failed:", cancelResponse.status);
          return new Response(
            JSON.stringify({ error: "MP_CANCEL_FAILED", message: "No se pudo programar la cancelación en Mercado Pago" }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }

      message = "Plan downgrade programado. Se cancelará al final del período actual.";
    }
    // Case 2: Upgrading to a higher tier
    else if (isUpgrade && !isFreePlan) {
      const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
      if (!mpAccessToken) {
        return new Response(
          JSON.stringify({ error: "MP_CONFIG_ERROR", message: "Mercado Pago no configurado" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Calculate billing dates
      const nextBillingDate = new Date(now.getTime() + newPlan.duration_days * 24 * 60 * 60 * 1000);

      const normalizedTier = normalizeTier(newPlan.code);
      const normalizedCadence = normalizeCadence(cadence || "monthly") || "monthly";
      if (!normalizedTier) {
        return new Response(
          JSON.stringify({ error: "INVALID_PLAN_TIER", message: "No se pudo mapear el tier del plan de destino" }),
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

      const resolvedCatalogRow = resolvePlanCatalogRow(catalogRows ?? [], normalizedTier, normalizedCadence);
      const resolvedPreapprovalPlanId = resolvedCatalogRow?.preapproval_plan_id;
      if (!resolvedPreapprovalPlanId) {
        return new Response(
          JSON.stringify({ error: "PREAPPROVAL_PLAN_NOT_SYNCED", message: "Plan no sincronizado con Mercado Pago" }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
          plan_code: newPlan.code,
          expected_amount: newPlan.price,
          expected_currency: newPlan.currency,
          provider: "mercado_pago",
          external_reference: externalReference,
          token_hash: await sha256Text(checkoutToken),
          expires_at: checkoutExpiresAt.toISOString(),
          created_by: user.id,
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
      const mpPreapprovalRequest = {
        payer_email: user.email,
        back_url: `${Deno.env.get("FRONTEND_URL") || "https://orvel-dashboard.vercel.app"}/dashboard/billing/success`,
        reason: `${newPlan.name} - Salon De Belleza (Upgrade)`,
        external_reference: externalReference,
        site_id: "MLA",
        preapproval_plan_id: resolvedPreapprovalPlanId,
        status: "pending",
      };

      // Create preapproval in Mercado Pago
      const mpResponse = await fetch(`${MP_API_BASE}${MP_PREAPPROVAL_ENDPOINT}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mpAccessToken}`,
        },
        body: JSON.stringify(mpPreapprovalRequest),
      });

      if (!mpResponse.ok) {
        const errorText = await mpResponse.text();
        console.error("Mercado Pago API Error:", errorText);
        return new Response(
          JSON.stringify({ error: "MP_API_ERROR", message: "Error al crear pre-aprobación en Mercado Pago" }),
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

      // Update subscription with new preapproval
      updateData = {
        ...updateData,
        status: "pending",
        mp_preapproval_id: mpData.id,
        mp_preapproval_status: mpData.status || "pending",
        provider: "mercado_pago",
        provider_subscription_id: mpData.id,
        provider_plan_id: mpData.preapproval_plan_id || mpData.preapproval_plan?.id || null,
        tenant_id: business.owner_id,
        current_period_start: now.toISOString(),
        next_billing_date: nextBillingDate.toISOString(),
      };

      // Detect if using test token to return appropriate init_point
      // Mercado Pago returns BOTH init_point (production) AND sandbox_init_point (test)
      // Test tokens start with "TEST-" prefix
      const isTestMode = mpAccessToken.startsWith("TEST-");
      const effectiveInitPoint = isTestMode && mpData.sandbox_init_point
        ? mpData.sandbox_init_point
        : mpData.init_point;

      initPoint = effectiveInitPoint;
      message = "_redirect_to_mercadopago";
    }
    // Case 3: Same plan without existing MP
    else if (isFreePlan) {
      // Switch immediately for non-recurring plans
      const periodEnd = new Date(now.getTime() + newPlan.duration_days * 24 * 60 * 60 * 1000);
      
      updateData = {
        ...updateData,
        status: "active",
        period_end: periodEnd.toISOString(),
        next_billing_date: null,
        mp_preapproval_id: null,
        mp_preapproval_status: "active",
      };

      message = "Has cambiado de plan";
    }
    else {
      // Same tier or equivalent - just update the plan code
      message = "Plan actualizado";
    }

    // =============================================================================
    // 8. UPDATE SUBSCRIPTION
    // =============================================================================
    const { data: updatedSubscription, error: updateError } = await supabaseAdmin
      .from("business_subscriptions")
      .update(updateData)
      .eq("id", currentSubscription.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error updating subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "UPDATE_FAILED", message: "Error al actualizar suscripción" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 9. RETURN RESPONSE
    // =============================================================================
    // Add sandbox_init_point field when in test mode for clarity
    const responsePayload: Record<string, unknown> = {
      success: true,
      subscription: updatedSubscription,
      init_point: initPoint,
      message: message,
      change_type: isUpgrade ? "upgrade" : (isDowngrade || isFreePlan) ? "downgrade" : "same_tier",
    };

    // Include sandbox_init_point when in test mode
    const mpAccessTokenForResponse = Deno.env.get("MP_ACCESS_TOKEN") || "";
    if (mpAccessTokenForResponse.startsWith("TEST-") && initPoint) {
      responsePayload.sandbox_init_point = initPoint;
    }

    return new Response(
      JSON.stringify(responsePayload),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "INTERNAL_ERROR", message: "Error interno del servidor" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
