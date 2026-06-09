import type { SupabaseClient } from '@supabase/supabase-js';
import {
  getPlanEntitlementsFromCatalog,
  resolvePlanCodeFromCatalog
} from '../../../../core/catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../../../../core/catalog/reference-catalog.gateway';
import type { SubscriptionStatus } from './subscription-state-machine.api';

type EntitlementMetric = 'maxLocales' | 'maxRubros' | 'maxMonthlyBookings' | 'aiCreditsMonthly';
type EntitlementLimits = Record<EntitlementMetric, number | null>;
type CanonicalBillingPlanCode = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO';

export type EntitlementsSnapshot = {
  businessId: string;
  tenantId: string;
  subscriptionStatus: Extract<SubscriptionStatus, 'active' | 'trialing'>;
  planCode: CanonicalBillingPlanCode;
  limits: EntitlementLimits;
  source: 'subscription_state_machine';
};

export type EntitlementsRepository = {
  getActiveSnapshot(input: { businessId: string; tenantId: string }): Promise<EntitlementsSnapshot>;
};

let configuredRepository: EntitlementsRepository | null = null;
const DEFAULT_PLAN: CanonicalBillingPlanCode = 'FREE';

function normalizePlanCode(planCode: unknown): CanonicalBillingPlanCode {
  return (resolvePlanCodeFromCatalog(getRuntimeReferenceCatalogSnapshot(), planCode) as CanonicalBillingPlanCode | null) ?? DEFAULT_PLAN;
}

function getCatalogLimits(planCode: CanonicalBillingPlanCode): EntitlementLimits {
  const referenceCatalog = getRuntimeReferenceCatalogSnapshot();
  return getPlanEntitlementsFromCatalog(referenceCatalog, planCode) ?? getPlanEntitlementsFromCatalog(referenceCatalog, DEFAULT_PLAN)!;
}

function assertActive(status: string): Extract<SubscriptionStatus, 'active' | 'trialing'> {
  if (status === 'active' || status === 'trialing') return status;
  throw new Error('SUBSCRIPTION_NOT_ACTIVE');
}

export function createSupabaseEntitlementsRepository(supabase: Pick<SupabaseClient, 'rpc'>): EntitlementsRepository {
  return {
    async getActiveSnapshot(input) {
      const { data, error } = await supabase.rpc('get_business_entitlements_snapshot', {
        business_id: input.businessId,
        tenant_id: input.tenantId
      });

      if (error) throw new Error(error.message);

      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error('Subscription tenant scope not found or forbidden by RLS.');

      const planCode = normalizePlanCode(row.plan_code);
      return {
        businessId: String(row.business_id),
        tenantId: String(row.tenant_id),
        subscriptionStatus: assertActive(String(row.subscription_status)),
        planCode,
        limits: getCatalogLimits(planCode),
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

  const limit = snapshot.limits[input.metric];

  return limit === null || input.requestedUnits <= limit
    ? { allowed: true, reason: 'OK' }
    : { allowed: false, reason: 'ENTITLEMENT_LIMIT_EXCEEDED' };
}
