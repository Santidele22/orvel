import {
  CANONICAL_PLAN_CODES,
  normalizePlanCode,
  PLAN_ENTITLEMENTS,
  type CanonicalPlanCode,
  type PlanCode
} from '../../../core/plans/plan-entitlements';
import { getCatalogAddOn, type DashboardReferenceCatalog } from '../../../core/catalog/reference-catalog';
import {
  createDashboardReferenceCatalogRepository,
  type DashboardReferenceCatalogRepository
} from '../../../core/catalog/reference-catalog.gateway';

export const MULTI_BRANCH_ADD_ON_CODE = 'MULTI_BRANCH' as const;

export type BillingAddOnViewModel = {
  code: typeof MULTI_BRANCH_ADD_ON_CODE | 'EXTRA_BRANCH';
  label: string;
  priceMonthlyCents: number;
  billingCadence: 'monthly';
};

export type LandingPlanViewModel = {
  code: PlanCode;
  tier: Lowercase<CanonicalPlanCode>;
  name: string;
  priceMonthlyCents: number;
  billingCadences: {
    monthly: number;
    quarterly: number;
    annual: number;
  };
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null;
  includedLocalesLabel: string;
  multiBranchAddOnLabel: string;
  subscriptionProvider: 'mercado_pago';
};

type PlanEntitlementRow = {
  plan_code?: string | null;
  max_locales?: number | null;
  max_rubros?: number | null;
  max_monthly_bookings?: number | null;
};

type FetchLandingPlansOptions = {
  catalogRepository?: DashboardReferenceCatalogRepository;
  allowUnavailableFallback?: boolean;
};

const LANDING_PLAN_ORDER: readonly Extract<CanonicalPlanCode, 'STARTER' | 'GROWTH' | 'PRO'>[] = [
  'STARTER',
  'GROWTH',
  'PRO'
];

const PLAN_COPY: Record<CanonicalPlanCode, { name: string; priceMonthlyCents: number; billingCadences: { monthly: number; quarterly: number; annual: number } }> = {
  FREE: { 
    name: 'Free', 
    priceMonthlyCents: 0, 
    billingCadences: { monthly: 0, quarterly: 0, annual: 0 } 
  },
  STARTER: { 
    name: 'Starter', 
    priceMonthlyCents: 1200, 
    billingCadences: { 
      monthly: 12, 
      quarterly: 34,
      annual: 122
    } 
  },
  GROWTH: { 
    name: 'Growth', 
    priceMonthlyCents: 2200, 
    billingCadences: { 
      monthly: 22, 
      quarterly: 63,
      annual: 224
    } 
  },
  PRO: { 
    name: 'Pro', 
    priceMonthlyCents: 3900, 
    billingCadences: { 
      monthly: 39, 
      quarterly: 111,
      annual: 398
    } 
  }
};

function isTestRuntime(): boolean {
  const processLike = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process;
  return processLike?.env?.['NODE_ENV'] === 'test' || processLike?.env?.['VITEST'] === 'true';
}

export function getMultiBranchAddOnFallback(catalog?: DashboardReferenceCatalog | null): BillingAddOnViewModel {
  const catalogAddOn = catalog
    ? getCatalogAddOn(catalog, MULTI_BRANCH_ADD_ON_CODE) ?? getCatalogAddOn(catalog, 'EXTRA_BRANCH')
    : null;

  return {
    code: (catalogAddOn?.code as BillingAddOnViewModel['code'] | undefined) ?? MULTI_BRANCH_ADD_ON_CODE,
    label: catalogAddOn?.label ?? 'Sucursales adicionales / Multi-sucursal',
    priceMonthlyCents: catalogAddOn?.priceMonthlyCents ?? 2_000_000,
    billingCadence: 'monthly'
  };
}

function isPlanCode(value: string): value is CanonicalPlanCode {
  return (CANONICAL_PLAN_CODES as readonly string[]).includes(value);
}

function normalizeLandingPlanCode(raw: string | null | undefined): CanonicalPlanCode | null {
  if (!raw) {
    return null;
  }

  const normalized = normalizePlanCode(raw);
  return isPlanCode(normalized) ? normalized : null;
}

function fromEntitlementsMap(): LandingPlanViewModel[] {
  return LANDING_PLAN_ORDER.map((code) => ({
    code,
    tier: code.toLowerCase() as LandingPlanViewModel['tier'],
    name: PLAN_COPY[code].name,
    priceMonthlyCents: PLAN_COPY[code].priceMonthlyCents,
    billingCadences: PLAN_COPY[code].billingCadences,
    maxLocales: PLAN_ENTITLEMENTS[code].maxLocales,
    maxRubros: PLAN_ENTITLEMENTS[code].maxRubros,
    maxMonthlyBookings: PLAN_ENTITLEMENTS[code].maxMonthlyBookings,
    includedLocalesLabel: '1 local incluido',
    multiBranchAddOnLabel: 'Multi-sucursal disponible como add-on',
    subscriptionProvider: 'mercado_pago'
  }));
}

export function getLandingPlansFallback(): LandingPlanViewModel[] {
  return fromEntitlementsMap();
}

function fromPlanEntitlementsRows(rows: PlanEntitlementRow[]): LandingPlanViewModel[] {
  const byCode = new Map<CanonicalPlanCode, LandingPlanViewModel>();
  const fallbackByCode = new Map(fromEntitlementsMap().map((item) => [item.code, item] as const));

  for (const row of rows) {
    const code = normalizeLandingPlanCode(row.plan_code);
    if (!code) {
      continue;
    }

    const staticEntitlements = PLAN_ENTITLEMENTS[code];

    byCode.set(code, {
      code,
      tier: code.toLowerCase() as LandingPlanViewModel['tier'],
      name: PLAN_COPY[code].name,
      priceMonthlyCents: PLAN_COPY[code].priceMonthlyCents,
      billingCadences: PLAN_COPY[code].billingCadences,
      maxLocales: Math.max(staticEntitlements.maxLocales, Number(row.max_locales ?? 0)),
      maxRubros: Math.max(staticEntitlements.maxRubros, Number(row.max_rubros ?? 0)),
      maxMonthlyBookings: row.max_monthly_bookings !== undefined ? row.max_monthly_bookings : staticEntitlements.maxMonthlyBookings,
      includedLocalesLabel: '1 local incluido',
      multiBranchAddOnLabel: 'Multi-sucursal disponible como add-on',
      subscriptionProvider: 'mercado_pago'
    });
  }

  return LANDING_PLAN_ORDER.map((code) => byCode.get(code) ?? fallbackByCode.get(code)).filter(
    (plan): plan is LandingPlanViewModel => Boolean(plan)
  );
}

function fromReferenceCatalog(catalog: DashboardReferenceCatalog): LandingPlanViewModel[] {
  const fallbackByCode = new Map(fromEntitlementsMap().map((item) => [item.code, item] as const));
  const catalogPlanByCode = new Map(
    catalog.plans
      .map((plan) => [normalizeLandingPlanCode(plan.code), plan] as const)
      .filter((entry): entry is readonly [CanonicalPlanCode, (typeof catalog.plans)[number]] => entry[0] !== null)
  );

  return LANDING_PLAN_ORDER.map((code) => {
    const catalogPlan = catalogPlanByCode.get(code);
    const fallback = fallbackByCode.get(code);
    const staticEntitlements = PLAN_ENTITLEMENTS[code];

    if (!catalogPlan) {
      return fallback;
    }

    return {
      code,
      tier: code.toLowerCase() as LandingPlanViewModel['tier'],
      name: PLAN_COPY[code].name,
      priceMonthlyCents: PLAN_COPY[code].priceMonthlyCents,
      billingCadences: PLAN_COPY[code].billingCadences,
      maxLocales: Math.max(staticEntitlements.maxLocales, catalogPlan.maxLocales),
      maxRubros: Math.max(staticEntitlements.maxRubros, catalogPlan.maxRubros),
      maxMonthlyBookings: catalogPlan.maxMonthlyBookings,
      includedLocalesLabel: '1 local incluido',
      multiBranchAddOnLabel: 'Multi-sucursal disponible como add-on',
      subscriptionProvider: 'mercado_pago'
    };
  }).filter((plan): plan is LandingPlanViewModel => Boolean(plan));
}

export async function fetchLandingPlans(options: FetchLandingPlansOptions = {}): Promise<LandingPlanViewModel[]> {
  const maybeSource = globalThis as {
    __LANDING_PLAN_ENTITLEMENTS__?: PlanEntitlementRow[];
  };

  const repository = options.catalogRepository ?? createDashboardReferenceCatalogRepository();

  try {
    return fromReferenceCatalog(await repository.getDashboardReferenceCatalog());
  } catch (error) {
    const allowUnavailableFallback = options.allowUnavailableFallback === true || isTestRuntime();
    const sourceRows = maybeSource.__LANDING_PLAN_ENTITLEMENTS__;
    if (allowUnavailableFallback && Array.isArray(sourceRows) && sourceRows.length > 0) {
      return fromPlanEntitlementsRows(sourceRows);
    }

    if (allowUnavailableFallback) {
      return getLandingPlansFallback();
    }

    throw error;
  }
}
