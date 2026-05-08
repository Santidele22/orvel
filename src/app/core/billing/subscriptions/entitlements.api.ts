import type { SupabaseClient } from '@supabase/supabase-js';
import type { PlanCode, SubscriptionStatus } from './subscription-state-machine.api';

type EntitlementMetric = 'maxLocales' | 'maxRubros' | 'aiCreditsMonthly';
type EntitlementLimits = Record<EntitlementMetric, number>;

export type EntitlementsSnapshot = {
  businessId: string;
  tenantId: string;
  subscriptionStatus: Extract<SubscriptionStatus, 'active' | 'trialing'>;
  planCode: PlanCode;
  limits: EntitlementLimits;
  source: 'subscription_state_machine';
};

export type EntitlementsRepository = {
  getActiveSnapshot(input: { businessId: string; tenantId: string }): Promise<EntitlementsSnapshot>;
};

const PLAN_LIMITS: Record<PlanCode, EntitlementLimits> = {
  FREE: { maxLocales: 1, maxRubros: 1, aiCreditsMonthly: 0 },
  BASIC: { maxLocales: 1, maxRubros: 2, aiCreditsMonthly: 100 },
  MEDIUM: { maxLocales: 3, maxRubros: 3, aiCreditsMonthly: 500 },
  PRO: { maxLocales: 10, maxRubros: 10, aiCreditsMonthly: 2000 }
};

let configuredRepository: EntitlementsRepository | null = null;

function normalizePlanCode(planCode: string): PlanCode {
  const normalized = planCode.toUpperCase();
  if (normalized === 'STARTER') return 'BASIC';
  if (normalized === 'GROWTH') return 'MEDIUM';
  if (normalized === 'FREE' || normalized === 'BASIC' || normalized === 'MEDIUM' || normalized === 'PRO') return normalized;
  return 'FREE';
}

function assertActive(status: string): Extract<SubscriptionStatus, 'active' | 'trialing'> {
  if (status === 'active' || status === 'trialing') return status;
  throw new Error('SUBSCRIPTION_NOT_ACTIVE');
}

export function createSupabaseEntitlementsRepository(supabase: Pick<SupabaseClient, 'rpc'>): EntitlementsRepository {
  return {
    async getActiveSnapshot(input) {
      const { data, error } = await supabase.rpc('get_business_entitlements_snapshot', {
        p_business_id: input.businessId,
        p_tenant_id: input.tenantId
      });

      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('Subscription tenant scope not found or forbidden by RLS.');

      const planCode = normalizePlanCode(String(row.plan_code));
      return {
        businessId: String(row.business_id),
        tenantId: String(row.tenant_id),
        subscriptionStatus: assertActive(String(row.subscription_status)),
        planCode,
        limits: {
          maxLocales: Number(row.max_locales ?? PLAN_LIMITS[planCode].maxLocales),
          maxRubros: Number(row.max_rubros ?? PLAN_LIMITS[planCode].maxRubros),
          aiCreditsMonthly: Number(row.ai_credits_monthly ?? PLAN_LIMITS[planCode].aiCreditsMonthly)
        },
        source: 'subscription_state_machine'
      };
    }
  };
}

export function configureEntitlementsRepository(repository: EntitlementsRepository | null): void {
  configuredRepository = repository;
}

function getRepository(): EntitlementsRepository {
  if (!configuredRepository) {
    throw new Error('Entitlements repository not configured. Wire createSupabaseEntitlementsRepository() to an authenticated Supabase client.');
  }

  return configuredRepository;
}

export async function getEntitlementsSnapshot(input: { businessId: string; tenantId: string }): Promise<EntitlementsSnapshot> {
  return getRepository().getActiveSnapshot(input);
}

export async function assertEntitlement(input: {
  businessId: string;
  tenantId: string;
  metric: EntitlementMetric;
  requestedUnits: number;
}): Promise<{ allowed: true; reason: 'OK' } | { allowed: false; reason: 'SUBSCRIPTION_NOT_ACTIVE' | 'ENTITLEMENT_LIMIT_EXCEEDED' }> {
  let snapshot: EntitlementsSnapshot;
  try {
    snapshot = await getEntitlementsSnapshot({ businessId: input.businessId, tenantId: input.tenantId });
  } catch {
    return { allowed: false, reason: 'SUBSCRIPTION_NOT_ACTIVE' };
  }

  return input.requestedUnits <= snapshot.limits[input.metric]
    ? { allowed: true, reason: 'OK' }
    : { allowed: false, reason: 'ENTITLEMENT_LIMIT_EXCEEDED' };
}
