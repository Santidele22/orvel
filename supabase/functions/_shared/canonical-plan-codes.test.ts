import { assertEquals } from "std/assert/assert_equals.ts";

import { normalizeCanonicalPlanCode } from "./canonical-plan-codes.ts";

Deno.test("normalizeCanonicalPlanCode keeps canonical plans canonical", () => {
  assertEquals(normalizeCanonicalPlanCode("FREE"), "FREE");
  assertEquals(normalizeCanonicalPlanCode("STARTER"), "STARTER");
  assertEquals(normalizeCanonicalPlanCode("GROWTH"), "GROWTH");
  assertEquals(normalizeCanonicalPlanCode("PRO"), "PRO");
});

Deno.test("normalizeCanonicalPlanCode accepts legacy aliases only as input", () => {
  assertEquals(normalizeCanonicalPlanCode("BASIC"), "STARTER");
  assertEquals(normalizeCanonicalPlanCode("MEDIUM"), "GROWTH");
  assertEquals(normalizeCanonicalPlanCode("started"), "STARTER");
});
