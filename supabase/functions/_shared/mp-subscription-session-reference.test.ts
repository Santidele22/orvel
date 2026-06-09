import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  createSubscriptionSessionReference,
  isLegacyCheckoutSessionReference,
  parseBillingSessionReference,
} from "./mp-subscription-session-reference.ts";

Deno.test("creates canonical preapproval/subscription session references", () => {
  assertEquals(createSubscriptionSessionReference("abc123"), "preapproval-session:abc123");
});

Deno.test("accepts subscription/preapproval references as canonical", () => {
  assertEquals(parseBillingSessionReference("preapproval-session:abc123"), {
    kind: "preapproval",
    value: "abc123",
    canonical: true,
  });
  assertEquals(parseBillingSessionReference("subscription-session:def456"), {
    kind: "subscription",
    value: "def456",
    canonical: true,
  });
});

Deno.test("keeps checkout-session as legacy compatibility only", () => {
  assertEquals(parseBillingSessionReference("checkout-session:legacy"), {
    kind: "checkout_legacy",
    value: "legacy",
    canonical: false,
  });
  assertEquals(isLegacyCheckoutSessionReference("checkout-session:legacy"), true);
});

Deno.test("rejects missing or malformed references", () => {
  assertEquals(parseBillingSessionReference(null), null);
  assertEquals(parseBillingSessionReference(""), null);
  assertEquals(parseBillingSessionReference("checkout-session:"), null);
  assertEquals(parseBillingSessionReference("payment-session:abc"), null);
});
