// change-subscription Edge Function
// Handles plan upgrades/downgrades
// Endpoint: POST /functions/v1/change-subscription

import { createClient } from "@supabase/supabase-js";
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";
import { normalizeCanonicalPlanCode } from "../_shared/canonical-plan-codes.ts";

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

interface ChangeSubscriptionRequest {
  business_id: string;
  new_plan_code: string;
  cadence?: string;
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

    const canonicalNewPlanCode = normalizeCanonicalPlanCode(new_plan_code);

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
      .eq("code", normalizeCanonicalPlanCode(currentSubscription.plan_code))
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

    let message = "Plan cambiado exitosamente";

    // Case 1: Downgrading to free or cheaper plan (local scheduled change)
    if ((isDowngrade || isFreePlan) && currentSubscription.mp_preapproval_id) {
      updateData = {
        ...updateData,
        status: "scheduled_change",
        cancel_at_period_end: true,
      };

      message = "Plan downgrade programado. Se cancelará al final del período actual.";
    }
    // Case 2: Upgrading to a higher tier requires manual coordination
    else if (isUpgrade && !isFreePlan) {
      return new Response(
        JSON.stringify({
          error: "PREAPPROVAL_PLAN_MANUAL_CONFIGURATION_REQUIRED",
          message: "Contactá a soporte para coordinar el cambio de plan.",
        }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
    const responsePayload: Record<string, unknown> = {
      success: true,
      subscription: updatedSubscription,
      message: message,
      change_type: isUpgrade ? "upgrade" : (isDowngrade || isFreePlan) ? "downgrade" : "same_tier",
    };

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
