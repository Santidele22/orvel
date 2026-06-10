// subscription-expiry-check Edge Function
// Checks for expired subscriptions and updates their status
// Endpoint: POST /functions/v1/subscription-expiry-check
// Can be called by cron job or manually

import { createClient } from "@supabase/supabase-js";
import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";

interface ExpiryCheckResult {
  processed: number;
  expired: number;
  errors: number;
  subscriptions: Array<{
    id: string;
    business_id: string;
    plan_code: string;
    period_end: string;
    old_status: string;
    new_status: string;
  }>;
}

Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  try {
    const cronHeader = req.headers.get("x-cron-key");
    const expectedCronKey = Deno.env.get("CRON_KEY");

    if (!expectedCronKey || cronHeader !== expectedCronKey) {
      return new Response(
        JSON.stringify({ error: "UNAUTHORIZED", message: "No autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with admin privileges to bypass RLS
    const supabaseAdmin = createClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY")
    );

    // =============================================================================
    // 1. FIND EXPIRED SUBSCRIPTIONS
    // =============================================================================
    const now = new Date().toISOString();

    // Get subscriptions that:
    // - Have a period_end date in the past
    // - Are not already cancelled
    // - Not free plans (they don't expire the same way)
    const { data: expiredSubscriptions, error: fetchError } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, business_id, plan_code, status, period_end, mp_preapproval_id")
      .lte("period_end", now)
      .neq("status", "cancelled")
      .neq("status", "expired")
      .not("plan_code", "eq", "free");

    if (fetchError) {
      console.error("Error fetching expired subscriptions:", fetchError);
      return new Response(
        JSON.stringify({ error: "FETCH_ERROR", message: "Error al buscar suscripciones expiradas" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result: ExpiryCheckResult = {
      processed: 0,
      expired: 0,
      errors: 0,
      subscriptions: [],
    };

    // =============================================================================
    // 2. UPDATE EACH EXPIRED SUBSCRIPTION
    // =============================================================================
    for (const sub of expiredSubscriptions || []) {
      try {
        // Update subscription to expired
        const { error: updateError } = await supabaseAdmin
          .from("business_subscriptions")
          .update({
            status: "expired",
            updated_at: now,
            cancel_reason: "expired",
          })
          .eq("id", sub.id);

        if (updateError) {
          console.error(`Error updating subscription ${sub.id}:`, updateError);
          result.errors++;
          continue;
        }

        // Optionally notify Mercado Pago to pause/can cel
        if (sub.mp_preapproval_id) {
          try {
            const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
            if (mpAccessToken) {
              // Note: MP doesn't have a direct "expire" API, but we can pause
              // For now, we just log this - the subscription is already expired in our system
              console.log(`Subscription ${sub.id} expired, MP preapproval: ${sub.mp_preapproval_id}`);
            }
          } catch (mpError) {
            console.error(`Error notifying MP for ${sub.id}:`, mpError);
            // Don't fail the whole process for this
          }
        }

        result.subscriptions.push({
          id: sub.id,
          business_id: sub.business_id,
          plan_code: sub.plan_code,
          period_end: sub.period_end,
          old_status: sub.status,
          new_status: "expired",
        });
        result.expired++;

      } catch (subError) {
        console.error(`Error processing subscription ${sub.id}:`, subError);
        result.errors++;
      }
    }

    result.processed = (expiredSubscriptions?.length || 0);

    // =============================================================================
    // 3. OPTIONAL: FIND SUBSCRIPTIONS TO CANCEL (period ended with cancel flag)
    // =============================================================================
    const { data: cancelAtEndSubscriptions } = await supabaseAdmin
      .from("business_subscriptions")
      .select("id, business_id, plan_code, status, period_end")
      .eq("status", "cancelled")
      .gte("period_end", now) // period hasn't ended yet
      .lt("cancelled_at", now); // was marked for cancellation

    if (cancelAtEndSubscriptions && cancelAtEndSubscriptions.length > 0) {
      // These should have already been handled, but check anyway
      console.log("Found subscriptions scheduled for cancellation:", cancelAtEndSubscriptions.length);
    }

    // =============================================================================
    // 4. RETURN RESULTS
    // =============================================================================
    return new Response(
      JSON.stringify({
        success: true,
        message: `Procesadas ${result.processed} suscripciones. ${result.expired} expiradas. ${result.errors} errores.`,
        result: result,
        timestamp: now,
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
