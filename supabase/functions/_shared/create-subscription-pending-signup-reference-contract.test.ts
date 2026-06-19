import { assert, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";

const CREATE_SUBSCRIPTION = new URL("../create-subscription/index.ts", import.meta.url);

Deno.test("create-subscription verifies a pending signup reference against the protected intent identity", async () => {
  const source = await Deno.readTextFile(CREATE_SUBSCRIPTION);

  assertStringIncludes(
    source,
    ".select(\"id, external_reference, email_hmac, plan_code, billing_period\")",
    "referenced pending signup lookup must load identity fields, not only id/external_reference",
  );
  assertStringIncludes(
    source,
    "referencedPendingIntent.email_hmac !== pendingSignupEmailHmac",
    "referenced pending signup must match the protected email assertion",
  );
  assertStringIncludes(
    source,
    "normalizeCanonicalPlanCode(referencedPendingIntent.plan_code || \"\") !== canonicalPlanCode",
    "referenced pending signup must match the requested canonical plan",
  );
  assertStringIncludes(
    source,
    "normalizeBillingCadence(referencedPendingIntent.billing_period) !== requestedCadence",
    "referenced pending signup must match the requested billing cadence",
  );
  assert(
    source.includes("PENDING_SIGNUP_REFERENCE_MISMATCH"),
    "mismatched reference/intent pairs must fail closed before Mercado Pago creation",
  );
});
