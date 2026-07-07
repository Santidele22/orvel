import { assertEquals } from "std/assert/assert_equals.ts";

import { buildTierCode, normalizeCadence, normalizeTier } from "./mp-plan-catalog.ts";

Deno.test("normalizeTier returns canonical preapproval catalog tiers", () => {
  assertEquals(normalizeTier("premium"), "premium");
});

Deno.test("normalizeTier accepts legacy Mercado Pago tier aliases as input", () => {
  assertEquals(normalizeTier("started"), "premium");
  assertEquals(normalizeTier("basic"), "premium");
  assertEquals(normalizeTier("medium"), "premium");
  assertEquals(normalizeTier("pro"), "premium");
});

Deno.test("buildTierCode emits the canonical PREMIUM_MONTHLY code", () => {
  assertEquals(buildTierCode("premium", "monthly"), "PREMIUM_MONTHLY");
  assertEquals(buildTierCode("started", "monthly"), "PREMIUM_MONTHLY");
});

Deno.test("normalizeCadence keeps only the MVP monthly cadence active", () => {
  assertEquals(normalizeCadence("monthly"), "monthly");
  assertEquals(normalizeCadence("quarterly"), null);
  assertEquals(normalizeCadence("annual"), null);
});
