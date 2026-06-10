import { assertEquals } from "std/assert/assert_equals.ts";
import {
  canonicalDomainErrorHttpStatus,
  resolveTrustedPaidPlanMapping,
  mapWebhookStatusToSubscriptionStatus,
} from "./mp-subscription-guards.ts";

Deno.test("resolveTrustedPaidPlanMapping accepts free plans without mapping", () => {
  const result = resolveTrustedPaidPlanMapping({
    planPrice: 0,
    catalogPreapprovalPlanId: null,
    legacyPlanPreapprovalId: null,
  });

  assertEquals(result.ok, true);
});

Deno.test("resolveTrustedPaidPlanMapping fails for paid plans without mapping", () => {
  const result = resolveTrustedPaidPlanMapping({
    planPrice: 14999,
    catalogPreapprovalPlanId: null,
    legacyPlanPreapprovalId: "",
  });

  assertEquals(result, {
    ok: false,
    code: "PLAN_MAPPING_REQUIRED",
    message: "No existe mapping server-side de preapproval_plan_id para este plan pago",
  });
});

Deno.test("resolveTrustedPaidPlanMapping fails for paid plans with invalid mapping format", () => {
  const result = resolveTrustedPaidPlanMapping({
    planPrice: 14999,
    catalogPreapprovalPlanId: "bad-format-***",
    legacyPlanPreapprovalId: null,
  });

  assertEquals(result, {
    ok: false,
    code: "PLAN_MAPPING_INVALID",
    message: "El mapping server-side de preapproval_plan_id tiene formato inválido",
  });
});

Deno.test("resolveTrustedPaidPlanMapping uses catalog mapping for paid plans", () => {
  const result = resolveTrustedPaidPlanMapping({
    planPrice: 14999,
    catalogPreapprovalPlanId: "2c93808412345678",
    legacyPlanPreapprovalId: null,
  });

  assertEquals(result, { ok: true, preapprovalPlanId: "2c93808412345678" });
});

Deno.test("mapWebhookStatusToSubscriptionStatus keeps preapproval authorized pending", () => {
  assertEquals(mapWebhookStatusToSubscriptionStatus("preapproval", "authorized"), "pending");
  assertEquals(mapWebhookStatusToSubscriptionStatus("subscription_preapproval", "authorized"), "pending");
});

Deno.test("mapWebhookStatusToSubscriptionStatus activates only approved", () => {
  assertEquals(mapWebhookStatusToSubscriptionStatus("payment", "approved"), "active");
});

Deno.test("canonicalDomainErrorHttpStatus maps canonical backend codes", () => {
  assertEquals(canonicalDomainErrorHttpStatus("PLAN_MAPPING_REQUIRED"), 422);
  assertEquals(canonicalDomainErrorHttpStatus("PLAN_MAPPING_INVALID"), 422);
  assertEquals(canonicalDomainErrorHttpStatus("IDEMPOTENCY_KEY_CONFLICT"), 409);
});
