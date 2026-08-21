import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePlanCode, type CanonicalPlanCode } from '../plans/plan-entitlements';

export type EntitlementSnapshot = {
  businessId: string;
  planCode: CanonicalPlanCode;
  limits: {
    maxLocales: number;
    maxRubros: number;
    maxMonthlyBookings: number | null;
    aiCreditsMonthly: number;
  };
  usage: {
    locales: number;
    rubros: number;
    monthlyBookings: number;
    aiCreditsUsed: number;
  };
  subscriptionStatus: 'active' | 'trialing' | 'inactive' | 'unavailable';
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
      reason: 'ENTITLEMENT_LIMIT_EXCEEDED' | 'SUBSCRIPTION_NOT_ACTIVE' | 'UNAVAILABLE';
      remaining: 0;
    };

type EntitlementMetric = 'maxLocales' | 'maxRubros' | 'maxMonthlyBookings' | 'aiCreditsMonthly';

type EntitlementsRpcClient = Pick<SupabaseClient, 'rpc'>;

type EntitlementsRpcRow = {
  business_id?: unknown;
  businessId?: unknown;
  subscription_status?: unknown;
  subscriptionStatus?: unknown;
  plan_code?: unknown;
  planCode?: unknown;
  max_locales?: unknown;
  maxLocales?: unknown;
  max_rubros?: unknown;
  maxRubros?: unknown;
  max_monthly_bookings?: unknown;
  maxMonthlyBookings?: unknown;
  ai_credits_monthly?: unknown;
  aiCreditsMonthly?: unknown;
  used_locales?: unknown;
  locales?: unknown;
  used_rubros?: unknown;
  rubros?: unknown;
  monthly_bookings_used?: unknown;
  monthlyBookings?: unknown;
  ai_credits_used?: unknown;
  aiCreditsUsed?: unknown;
};

export type ServerEntitlementsRepository = {
  getSnapshot(input: { businessId: string; tenantId?: string }): Promise<EntitlementSnapshot>;
};

let configuredRepository: ServerEntitlementsRepository | null = null;

function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readNullableNumber(value: unknown, fallback: number | null = 0): number | null {
  if (value === null) return null;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function closedSnapshot(businessId: string, reason: 'inactive' | 'unavailable' = 'unavailable'): EntitlementSnapshot {
  return {
    businessId,
    planCode: 'FREE',
    limits: {
      maxLocales: 0,
      maxRubros: 0,
      maxMonthlyBookings: 0,
      aiCreditsMonthly: 0
    },
    usage: {
      locales: 0,
      rubros: 0,
      monthlyBookings: 0,
      aiCreditsUsed: 0
    },
    subscriptionStatus: reason,
    source: 'server'
  };
}

function normalizeSnapshotRow(row: EntitlementsRpcRow, requestedBusinessId: string): EntitlementSnapshot {
  const subscriptionStatus = readString(row.subscription_status ?? row.subscriptionStatus, 'unavailable');
  if (subscriptionStatus !== 'active' && subscriptionStatus !== 'trialing') {
    return closedSnapshot(readString(row.business_id ?? row.businessId, requestedBusinessId), 'inactive');
  }
  const activeSubscriptionStatus: 'active' | 'trialing' = subscriptionStatus === 'active' ? 'active' : 'trialing';

  return {
    businessId: readString(row.business_id ?? row.businessId, requestedBusinessId),
    planCode: normalizePlanCode(row.plan_code ?? row.planCode),
    limits: {
      maxLocales: readNumber(row.max_locales ?? row.maxLocales),
      maxRubros: readNumber(row.max_rubros ?? row.maxRubros),
      maxMonthlyBookings: readNullableNumber(row.max_monthly_bookings ?? row.maxMonthlyBookings),
      aiCreditsMonthly: readNumber(row.ai_credits_monthly ?? row.aiCreditsMonthly)
    },
    usage: {
      locales: readNumber(row.used_locales ?? row.locales),
      rubros: readNumber(row.used_rubros ?? row.rubros),
      monthlyBookings: readNumber(row.monthly_bookings_used ?? row.monthlyBookings),
      aiCreditsUsed: readNumber(row.ai_credits_used ?? row.aiCreditsUsed)
    },
    subscriptionStatus: activeSubscriptionStatus,
    source: 'server'
  };
}

export function createServerEntitlementsRepository(supabase: EntitlementsRpcClient): ServerEntitlementsRepository {
  return {
    async getSnapshot(input) {
      const { data, error } = await supabase.rpc('get_business_entitlements_snapshot', {
        business_id: input.businessId,
        tenant_id: input.tenantId
      });

      if (error) {
        throw new Error(error.message ?? 'UNAVAILABLE');
      }

      const row = (Array.isArray(data) ? data[0] : data) as EntitlementsRpcRow | null;
      if (!row) {
        throw new Error('UNAVAILABLE');
      }

      return normalizeSnapshotRow(row, input.businessId);
    }
  };
}

export function configureServerEntitlementsRepository(repository: ServerEntitlementsRepository | null): void {
  configuredRepository = repository;
}

function getConfiguredRepository(): ServerEntitlementsRepository | null {
  return configuredRepository;
}

export async function getBusinessEntitlementsSnapshot(input: {
  businessId: string;
  tenantId?: string;
  repository?: ServerEntitlementsRepository;
  invoker?: EntitlementsRpcClient;
}): Promise<EntitlementSnapshot> {
  try {
    const repository =
      input.repository ??
      (input.invoker
        ? createServerEntitlementsRepository(input.invoker)
        : (getConfiguredRepository() ?? (await createDefaultServerEntitlementsRepository())));
    return await repository.getSnapshot({ businessId: input.businessId, tenantId: input.tenantId });
  } catch {
    return closedSnapshot(input.businessId);
  }
}

export async function createDefaultServerEntitlementsRepository(): Promise<ServerEntitlementsRepository> {
  const { createSupabaseClient } = await import('../runtime/supabase-client');
  return createServerEntitlementsRepository(createSupabaseClient());
}

export async function assertBusinessEntitlement(input: {
  businessId: string;
  tenantId?: string;
  metric: EntitlementMetric;
  requestedUnits: number;
  repository?: ServerEntitlementsRepository;
  invoker?: EntitlementsRpcClient;
}): Promise<EntitlementDecision> {
  const snapshot = await getBusinessEntitlementsSnapshot({
    businessId: input.businessId,
    tenantId: input.tenantId,
    repository: input.repository,
    invoker: input.invoker
  });
  if (snapshot.subscriptionStatus === 'unavailable') {
    return { allowed: false, reason: 'UNAVAILABLE', remaining: 0 };
  }
  if (snapshot.subscriptionStatus !== 'active' && snapshot.subscriptionStatus !== 'trialing') {
    return { allowed: false, reason: 'SUBSCRIPTION_NOT_ACTIVE', remaining: 0 };
  }

  const requestedUnits = Math.max(0, Math.trunc(input.requestedUnits));

  const metricLimit = snapshot.limits[input.metric];
  const metricUsage =
    input.metric === 'maxLocales'
      ? snapshot.usage.locales
      : input.metric === 'maxRubros'
        ? snapshot.usage.rubros
        : input.metric === 'maxMonthlyBookings'
          ? snapshot.usage.monthlyBookings
          : snapshot.usage.aiCreditsUsed;

  if (metricLimit === null) {
    return {
      allowed: true,
      reason: 'OK',
      remaining: Number.POSITIVE_INFINITY
    };
  }

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
