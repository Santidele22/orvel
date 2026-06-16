// cancel-subscription Edge Function
// Handles subscription cancellation
// Endpoint: POST /functions/v1/cancel-subscription

import { createClient } from "@supabase/supabase-js";
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";

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

interface CancelSubscriptionRequest {
  business_id: string;
  reason?: string;
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
    let body: CancelSubscriptionRequest;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "INVALID_JSON", message: "Cuerpo de solicitud inválido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { business_id, reason } = body;
    if (!business_id || typeof business_id !== "string") {
      return new Response(
        JSON.stringify({ error: "BUSINESS_ID_REQUIRED", message: "El campo business_id es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        JSON.stringify({ error: "BUSINESS_NOT_FOUND", message: "Negocio no encontrado o no te pertenece" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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
        JSON.stringify({ error: "NO_ACTIVE_SUBSCRIPTION", message: "No tienes una suscripción activa para cancelar" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 5. CHECK IF ALREADY CANCELLED
    // =============================================================================
    if (currentSubscription.status === "cancelled" || currentSubscription.cancelled_at) {
      const periodEnd = currentSubscription.period_end 
        ? new Date(currentSubscription.period_end).toLocaleDateString("es-AR") 
        : "N/A";

      return new Response(
        JSON.stringify({ 
          success: true,
          message: "Tu suscripción ya está cancelada",
          cancellation: {
            cancelled_at: currentSubscription.cancelled_at,
            period_end: currentSubscription.period_end,
            display_date: periodEnd,
          }
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 6. SET CANCEL_AT_PERIOD_END
    // =============================================================================
    const now = new Date();
    const periodEnd = currentSubscription.period_end 
      ? new Date(currentSubscription.period_end) 
      : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Determine if we should cancel immediately or at period end
    // If there's no MP subscription, cancel immediately
    // If there's an MP subscription with an active payment, set cancel_at_period_end
    const shouldCancelImmediately = !currentSubscription.mp_preapproval_id || 
      currentSubscription.status === "pending";

    const updateData: Record<string, unknown> = {
      status: "cancelled",
      cancelled_at: now.toISOString(),
      cancel_reason: reason || "user_request",
      updated_at: now.toISOString(),
    };

    // Only set period_end for scheduled cancellation
    if (!shouldCancelImmediately && periodEnd > now) {
      // Keep the current period_end - cancellation happens automatically
      updateData.period_end = currentSubscription.period_end;
    } else {
      // Cancel immediately - set period_end to now
      updateData.period_end = now.toISOString();
    }

    // =============================================================================
    // 7. UPDATE SUBSCRIPTION
    // =============================================================================
    const { data: updatedSubscription, error: updateError } = await supabaseAdmin
      .from("business_subscriptions")
      .update(updateData)
      .eq("id", currentSubscription.id)
      .select()
      .single();

    if (updateError) {
      console.error("Error cancelling subscription:", updateError);
      return new Response(
        JSON.stringify({ error: "CANCEL_FAILED", message: "Error al cancelar suscripción" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // =============================================================================
    // 8. OPTIONAL: NOTIFY MP TO PAUSE (but not cancel immediately)
    // We don't cancel in MP - let the subscription expire naturally
    // This is intentional per the requirements
    // =============================================================================

    // =============================================================================
    // 9. RETURN RESPONSE
    // =============================================================================
    const displayCancelDate = shouldCancelImmediately 
      ? now.toLocaleDateString("es-AR")
      : periodEnd.toLocaleDateString("es-AR");

    return new Response(
      JSON.stringify({
        success: true,
        message: shouldCancelImmediately 
          ? "Suscripción cancelada inmediatamente" 
          : "Suscripción cancelada. Se cancelará al final del período de facturación actual.",
        cancellation: {
          cancelled_at: updatedSubscription.cancelled_at,
          period_end: updatedSubscription.period_end,
          display_date: displayCancelDate,
          immediate: shouldCancelImmediately,
          reason: reason || "user_request",
        },
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          plan_code: updatedSubscription.plan_code,
          period_end: updatedSubscription.period_end,
        },
      }),
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
