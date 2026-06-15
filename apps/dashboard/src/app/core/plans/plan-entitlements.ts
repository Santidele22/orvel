export type CanonicalPlanCode = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO';

export type LegacyPlanCode = 'STARTER' | 'BASIC' | 'MEDIUM';

export type PlanCode = CanonicalPlanCode | LegacyPlanCode;

export type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null; // null for unlimited
};

export const CANONICAL_PLAN_CODES = ['FREE', 'STARTER', 'GROWTH', 'PRO'] as const;

export const PLAN_CODE_ALIASES: Record<LegacyPlanCode, CanonicalPlanCode> = {
  STARTER: 'STARTER',
  BASIC: 'STARTER',
  MEDIUM: 'GROWTH'
};

export const CANONICAL_PLAN_ENTITLEMENTS: Record<CanonicalPlanCode, PlanEntitlements> = {
  FREE: { maxLocales: 1, maxRubros: 1, maxMonthlyBookings: 15 },
  STARTER: { maxLocales: 1, maxRubros: 2, maxMonthlyBookings: null },
  GROWTH: { maxLocales: 3, maxRubros: 5, maxMonthlyBookings: null },
  PRO: { maxLocales: 10, maxRubros: 10, maxMonthlyBookings: null }
};

export const PLAN_ENTITLEMENTS: Record<PlanCode, PlanEntitlements> = {
  FREE: CANONICAL_PLAN_ENTITLEMENTS.FREE,
  STARTER: CANONICAL_PLAN_ENTITLEMENTS.STARTER,
  GROWTH: CANONICAL_PLAN_ENTITLEMENTS.GROWTH,
  PRO: CANONICAL_PLAN_ENTITLEMENTS.PRO,
  BASIC: CANONICAL_PLAN_ENTITLEMENTS.STARTER,
  MEDIUM: CANONICAL_PLAN_ENTITLEMENTS.GROWTH
};

const DEFAULT_PLAN: CanonicalPlanCode = 'FREE';

export function normalizePlanCode(plan: unknown): CanonicalPlanCode {
  if (typeof plan !== 'string') {
    return DEFAULT_PLAN;
  }

  const normalizedPlan = plan.trim().toUpperCase();

  if ((CANONICAL_PLAN_CODES as readonly string[]).includes(normalizedPlan)) {
    return normalizedPlan as CanonicalPlanCode;
  }

  if (normalizedPlan in PLAN_CODE_ALIASES) {
    return PLAN_CODE_ALIASES[normalizedPlan as LegacyPlanCode];
  }

  return DEFAULT_PLAN;
}

export function getPlanEntitlements(plan: unknown): PlanEntitlements {
  return PLAN_ENTITLEMENTS[normalizePlanCode(plan)] || CANONICAL_PLAN_ENTITLEMENTS[DEFAULT_PLAN];
}
