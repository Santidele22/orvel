import { PLAN_ENTITLEMENTS, type PlanCode } from '../plans/plan-entitlements';

export type EntitlementSnapshot = {
  businessId: string;
  planCode: PlanCode;
  limits: {
    maxLocales: number;
    maxRubros: number;
  };
  usage: {
    locales: number;
    rubros: number;
  };
  source: 'server';
};

export type EntitlementDecision =
  | {
      allowed: true;
      reason: 'OK';
      remaining: number;
    }
  | {
      allowed: false;
      reason: 'ENTITLEMENT_LIMIT_EXCEEDED' | 'SUBSCRIPTION_NOT_ACTIVE';
      remaining: 0;
    };

type EntitlementMetric = 'maxLocales' | 'maxRubros';

const BUSINESS_PLAN: Record<string, PlanCode> = {
  biz_qa_001: 'STARTER'
};

const BUSINESS_USAGE: Record<string, { locales: number; rubros: number }> = {
  biz_qa_001: { locales: 0, rubros: 0 }
};

function resolvePlanCode(businessId: string): PlanCode {
  return BUSINESS_PLAN[businessId] ?? 'STARTER';
}

function resolveUsage(businessId: string): { locales: number; rubros: number } {
  return BUSINESS_USAGE[businessId] ?? { locales: 0, rubros: 0 };
}

export async function getBusinessEntitlementsSnapshot(input: { businessId: string }): Promise<EntitlementSnapshot> {
  const planCode = resolvePlanCode(input.businessId);
  const limits = PLAN_ENTITLEMENTS[planCode];
  const usage = resolveUsage(input.businessId);

  return {
    businessId: input.businessId,
    planCode,
    limits: {
      maxLocales: limits.maxLocales,
      maxRubros: limits.maxRubros
    },
    usage,
    source: 'server'
  };
}

export async function assertBusinessEntitlement(input: {
  businessId: string;
  metric: EntitlementMetric;
  requestedUnits: number;
}): Promise<EntitlementDecision> {
  const snapshot = await getBusinessEntitlementsSnapshot({ businessId: input.businessId });
  const requestedUnits = Math.max(0, Math.trunc(input.requestedUnits));

  const metricLimit = input.metric === 'maxLocales' ? snapshot.limits.maxLocales : snapshot.limits.maxRubros;
  const metricUsage = input.metric === 'maxLocales' ? snapshot.usage.locales : snapshot.usage.rubros;
  const remaining = Math.max(metricLimit - metricUsage, 0);

  if (requestedUnits <= remaining) {
    return {
      allowed: true,
      reason: 'OK',
      remaining: remaining - requestedUnits
    };
  }

  return {
    allowed: false,
    reason: 'ENTITLEMENT_LIMIT_EXCEEDED',
    remaining: 0
  };
}
