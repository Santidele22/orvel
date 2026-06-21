import { assertEquals } from "std/assert/assert_equals.ts";
import { evaluatePreapprovalPlanRollout } from "./mp-rollout-control.ts";

Deno.test("evaluatePreapprovalPlanRollout fails closed in production when rollout config is missing", () => {
  const decision = evaluatePreapprovalPlanRollout({
    tenantId: "tenant-a",
    userId: "user-a",
    environment: "production",
    rolloutPercentConfig: undefined,
  });

  assertEquals(decision.rolloutPercent, 0);
  assertEquals(decision.configValid, false);
  assertEquals(decision.allowed, false);
});

Deno.test("evaluatePreapprovalPlanRollout fails closed in production when rollout config is invalid", () => {
  const decision = evaluatePreapprovalPlanRollout({
    tenantId: "tenant-b",
    userId: "user-b",
    environment: "production",
    rolloutPercentConfig: "73",
  });

  assertEquals(decision.rolloutPercent, 0);
  assertEquals(decision.configValid, false);
  assertEquals(decision.allowed, false);
});

Deno.test("evaluatePreapprovalPlanRollout accepts only 0/10/50/100 values", () => {
  for (const value of ["0", "10", "50", "100"]) {
    const decision = evaluatePreapprovalPlanRollout({
      tenantId: "tenant-c",
      userId: "user-c",
      environment: "production",
      rolloutPercentConfig: value,
    });

    assertEquals(decision.configValid, true);
    assertEquals(decision.rolloutPercent, Number(value));
  }
});
