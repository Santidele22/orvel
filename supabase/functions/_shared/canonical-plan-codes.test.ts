import { assertEquals } from "std/assert/assert_equals.ts";

import { normalizeCanonicalPlanCode } from "./canonical-plan-codes.ts";

Deno.test("normalizeCanonicalPlanCode keeps canonical plans canonical", () => {
  assertEquals(normalizeCanonicalPlanCode("FREE"), "FREE");
  assertEquals(normalizeCanonicalPlanCode("PREMIUM"), "PREMIUM");
});

Deno.test("normalizeCanonicalPlanCode accepts legacy paid aliases as Premium input", () => {
  assertEquals(normalizeCanonicalPlanCode("BASIC"), "PREMIUM");
  assertEquals(normalizeCanonicalPlanCode("MEDIUM"), "PREMIUM");
  assertEquals(normalizeCanonicalPlanCode("started"), "PREMIUM");
  assertEquals(normalizeCanonicalPlanCode("pro"), "PREMIUM");
});
