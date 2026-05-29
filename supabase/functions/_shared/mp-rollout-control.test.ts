import { assertEquals } from "https://deno.land/std@0.224.0/assert/assert_equals.ts";
import { evaluatePreapprovalPlanRollout } from "./mp-rollout-control.ts";

Deno.test("evaluatePreapprovalPlanRollout fails closed in production when rollout config is missing", () => {
  Deno.env.delete("MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT");

  const decision = evaluatePreapprovalPlanRollout({
    tenantId: "tenant-a",
    userId: "user-a",
    environment: "production",
  });

  assertEquals(decision.rolloutPercent, 0);
  assertEquals(decision.configValid, false);
  assertEquals(decision.allowed, false);
});

Deno.test("evaluatePreapprovalPlanRollout fails closed in production when rollout config is invalid", () => {
  Deno.env.set("MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT", "73");

  const decision = evaluatePreapprovalPlanRollout({
    tenantId: "tenant-b",
    userId: "user-b",
    environment: "production",
  });

  assertEquals(decision.rolloutPercent, 0);
  assertEquals(decision.configValid, false);
  assertEquals(decision.allowed, false);
});

Deno.test("evaluatePreapprovalPlanRollout accepts only 0/10/50/100 values", () => {
  for (const value of ["0", "10", "50", "100"]) {
    Deno.env.set("MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT", value);
    const decision = evaluatePreapprovalPlanRollout({
      tenantId: "tenant-c",
      userId: "user-c",
      environment: "production",
    });

    assertEquals(decision.configValid, true);
    assertEquals(decision.rolloutPercent, Number(value));
  }
});
