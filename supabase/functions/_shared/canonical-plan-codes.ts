export type CanonicalPlanCode = "FREE" | "STARTER" | "GROWTH" | "PRO";

const PLAN_CODE_ALIASES: Record<string, CanonicalPlanCode> = {
  FREE: "FREE",
  BASIC: "STARTER",
  STARTED: "STARTER",
  STARTER: "STARTER",
  MEDIUM: "GROWTH",
  GROWTH: "GROWTH",
  PRO: "PRO",
};

export function normalizeCanonicalPlanCode(planCode: string): string {
  const normalized = planCode.trim().toUpperCase();
  return PLAN_CODE_ALIASES[normalized] ?? normalized;
}
