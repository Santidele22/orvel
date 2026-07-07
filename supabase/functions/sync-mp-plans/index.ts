import { createClient } from "@supabase/supabase-js";

import { getBillingCorsHeaders, rejectDisallowedBrowserOrigin, requireServerSecret } from "../_shared/billing-security.ts";
import { buildTierCode } from "../_shared/mp-plan-catalog.ts";
import { buildDashboardUrl } from "../_shared/orvel-url.ts";

export interface SyncMpPlansDependencies {
  createClient?: typeof createClient;
  envGet?: (key: string) => string | undefined;
}

export async function syncMpPlansHandler(
  req: Request,
  dependencies: SyncMpPlansDependencies = {},
): Promise<Response> {
  const createSupabaseClient = dependencies.createClient ?? createClient;
  const envGet = dependencies.envGet ?? ((key: string) => Deno.env.get(key));
  const corsHeaders = getBillingCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const disallowedOrigin = rejectDisallowedBrowserOrigin(req);
  if (disallowedOrigin) return disallowedOrigin;

  try {
    const cronHeader = req.headers.get("x-cron-key");
    const expectedCronKey = envGet("CRON_KEY");

    if (!expectedCronKey || cronHeader !== expectedCronKey) {
      return new Response(JSON.stringify({ success: false, error: "UNAUTHORIZED" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAdmin = createSupabaseClient(
      requireServerSecret("SUPABASE_URL"),
      requireServerSecret("SUPABASE_SERVICE_ROLE_KEY")
    );

    const { data: rows, error: rowsError } = await supabaseAdmin
      .from("mp_plan_catalog")
      .select("id, tier, cadence, tier_code, amount, currency, frequency, frequency_type, preapproval_plan_id")
      .eq("tier", "premium")
      .eq("cadence", "monthly");

    if (rowsError) throw rowsError;

    const results = [];

    for (const row of rows ?? []) {
      const cadence = String(row.cadence);
      const tierCode = String(row.tier_code || buildTierCode(String(row.tier), cadence));

      const preapprovalPlanId = typeof row.preapproval_plan_id === "string"
        ? row.preapproval_plan_id.trim()
        : "";

      if (preapprovalPlanId.length > 0) {
        results.push({ tier: row.tier, cadence, tier_code: tierCode, status: "configured", id: preapprovalPlanId });
        continue;
      }

      results.push({
        tier: row.tier,
        cadence,
        tier_code: tierCode,
        status: "manual_configuration_required",
        back_url: buildDashboardUrl("billing/success"),
      });
    }

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
}

if (import.meta.main) {
  Deno.serve((req) => syncMpPlansHandler(req));
}
