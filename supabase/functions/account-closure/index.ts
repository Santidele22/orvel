// 2.0 cleanup PR-1 — stubbed. Real implementation arrives when account-closure returns to scope.
import { billingSecurityHeaders } from "../_shared/billing-security.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { ...billingSecurityHeaders(req), "content-type": "application/json" },
    });
  }
  return new Response(
    JSON.stringify({
      error: "OUT_OF_MVP",
      function: "account-closure",
      reason: "Account closure is out of 2.0 MVP scope (Santi approved 2026-07-30).",
    }),
    {
      status: 501,
      headers: { ...billingSecurityHeaders(req), "content-type": "application/json" },
    },
  );
});
