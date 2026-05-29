import { createClient } from "@supabase/supabase-js";

import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";
import { buildTierCode } from "../_shared/mp-plan-catalog.ts";

const MP_API_BASE = "https://api.mercadopago.com";

Deno.serve(async (req) => {
  const corsHeaders = getBillingCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  try {
    const cronHeader = req.headers.get("x-cron-key");
    const expectedCronKey = Deno.env.get("CRON_KEY");

    if (!expectedCronKey || cronHeader !== expectedCronKey) {
      return new Response(JSON.stringify({ success: false, error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY")
    );

    const mpAccessToken = Deno.env.get("MP_ACCESS_TOKEN");
    const frontendUrl = Deno.env.get("FRONTEND_URL") || "https://dashboard.orvel.pro";

    if (!mpAccessToken) {
      throw new Error("MP_ACCESS_TOKEN is not configured");
    }

    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("mp_plan_catalog")
      .select("id, tier, cadence, tier_code, amount, currency, frequency, frequency_type, preapproval_plan_id")
      .in("tier", ["started", "medium", "pro"])
      .in("cadence", ["monthly", "quarterly", "annual"]);

    if (rowsError) throw rowsError;

    const results = [];

    for (const row of rows ?? []) {
      const cadence = String(row.cadence);
      const tierCode = String(row.tier_code || buildTierCode(String(row.tier), cadence));

      if (typeof row.preapproval_plan_id === "string" && row.preapproval_plan_id.length > 0) {
        results.push({ tier: row.tier, cadence, status: "already_synced", id: row.preapproval_plan_id });
        continue;
      }

      console.log(`Creating MP plan for ${tierCode}...`);

      const mpPlanRequest = {
        reason: `Salon De Belleza ${tierCode}`,
        site_id: "MLA",
        auto_recurring: {
          frequency: Number(row.frequency),
          frequency_type: String(row.frequency_type || "months"),
          transaction_amount: Number(row.amount),
          currency_id: String(row.currency || "ARS"),
        },
        back_url: `${frontendUrl}/dashboard/billing/success`,
      };

        const mpResponse = await fetch(`${MP_API_BASE}/preapproval_plan`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${mpAccessToken}`,
          },
          body: JSON.stringify(mpPlanRequest),
        });

      if (!mpResponse.ok) {
        const errorData = await mpResponse.json();
        console.error(`Error creating MP plan for ${tierCode}:`, errorData);
        results.push({ tier: row.tier, cadence, status: "error", error: errorData });
        continue;
      }

      const mpData = await mpResponse.json();

      const { error: updateError } = await supabaseAdmin
        .from("mp_plan_catalog")
        .update({
          preapproval_plan_id: mpData.id,
          last_synced_at: new Date().toISOString(),
          status: "active",
        })
        .eq("id", row.id);

      if (updateError) {
        console.error(`Error updating DB for ${tierCode}:`, updateError);
        results.push({ tier: row.tier, cadence, status: "db_update_error", error: updateError });
        continue;
      }

      results.push({ tier: row.tier, cadence, tier_code: tierCode, status: "created", id: mpData.id });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
