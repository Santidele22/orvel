export type AccountPlanPolicy = {
  accountEnabled: boolean;
  maxSalons: number;
};

type CanonicalPlanCode = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO';
type LegacyPlanCode = 'STARTER' | 'BASIC' | 'MEDIUM';
type PlanCode = CanonicalPlanCode | LegacyPlanCode;

const PLAN_CODE_ALIASES: Record<string, CanonicalPlanCode> = {
  FREE: 'FREE',
  BASIC: 'STARTER',
  MEDIUM: 'GROWTH',
  STARTER: 'STARTER'
};

const PLAN_LIMITS: Record<CanonicalPlanCode, number> = {
  FREE: 1,
  STARTER: 1,
  GROWTH: 3,
  PRO: 10
};

function resolvePlanCode(plan: unknown): CanonicalPlanCode {
  if (typeof plan !== 'string') {
    return 'FREE';
  }

  const normalizedPlan = plan.trim().toUpperCase();

  if (normalizedPlan in PLAN_CODE_ALIASES) {
    return PLAN_CODE_ALIASES[normalizedPlan];
  }

  if (['FREE', 'STARTER', 'GROWTH', 'PRO'].includes(normalizedPlan)) {
    return normalizedPlan as CanonicalPlanCode;
  }

  return 'FREE';
}

export function resolveAccountPlanPolicy(input: { plan: unknown; premiumPaid: boolean }): AccountPlanPolicy {
  const planCode = resolvePlanCode(input.plan);

  // If it's FREE plan, it's always enabled but with limits
  if (planCode === 'FREE') {
    return {
      accountEnabled: true,
      maxSalons: PLAN_LIMITS.FREE
    };
  }

  // For other plans, check if premium is paid
  // If not paid, they stay as FREE equivalent or disabled?
  // Usually, if they chose STARTER but didn't pay, they should be restricted.
  if (!input.premiumPaid) {
    return {
      accountEnabled: false,
      maxSalons: 1
    };
  }

  return {
    accountEnabled: true,
    maxSalons: PLAN_LIMITS[planCode]
  };
}

export function canCreateSalonUnderPlan(input: { plan: unknown; premiumPaid: boolean; currentSalons: number }): boolean {
  const policy = resolveAccountPlanPolicy({
    plan: input.plan,
    premiumPaid: input.premiumPaid
  });

  return input.currentSalons < policy.maxSalons;
}
