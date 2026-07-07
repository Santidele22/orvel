export type CanonicalPlanCode = "FREE" | "PREMIUM";

const PLAN_CODE_ALIASES: Record<string, CanonicalPlanCode> = {
  FREE: "FREE",
  BASIC: "PREMIUM",
  STARTED: "PREMIUM",
  STARTER: "PREMIUM",
  MEDIUM: "PREMIUM",
  GROWTH: "PREMIUM",
  PRO: "PREMIUM",
  SIMPLE: "PREMIUM",
  CRECE: "PREMIUM",
  ESCALA: "PREMIUM",
  PREMIUM: "PREMIUM",
};

export function normalizeCanonicalPlanCode(planCode: string): string {
  const normalized = planCode.trim().toUpperCase();
  return PLAN_CODE_ALIASES[normalized] ?? normalized;
}
