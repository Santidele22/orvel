import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";

import { buildTierCode, normalizeTier } from "./mp-plan-catalog.ts";

Deno.test("normalizeTier returns canonical preapproval catalog tiers", () => {
  assertEquals(normalizeTier("starter"), "starter");
  assertEquals(normalizeTier("growth"), "growth");
  assertEquals(normalizeTier("pro"), "pro");
});

Deno.test("normalizeTier accepts legacy Mercado Pago tier aliases as input", () => {
  assertEquals(normalizeTier("started"), "starter");
  assertEquals(normalizeTier("basic"), "starter");
  assertEquals(normalizeTier("medium"), "growth");
});

Deno.test("buildTierCode emits canonical STARTER/GROWTH/PRO codes", () => {
  assertEquals(buildTierCode("started", "monthly"), "STARTER_MONTHLY");
  assertEquals(buildTierCode("medium", "quarterly"), "GROWTH_QUARTERLY");
  assertEquals(buildTierCode("pro", "annual"), "PRO_ANNUAL");
});
