// 2.0 cleanup PR-1 — stubbed. Real implementation arrives when Mercado Pago billing returns to scope.
import { getBillingCorsHeaders } from "../_shared/billing-security.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...getBillingCorsHeaders(req), "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      error: "OUT_OF_MVP",
      function: "create-subscription",
      reason: "Mercado Pago billing is out of 2.0 MVP scope (Santi approved 2026-07-30). Reactivar en release post-2.0.",
    }),
    {
      status: 501,
      headers: { ...getBillingCorsHeaders(req), "content-type": "application/json" },
    },
  );
});
