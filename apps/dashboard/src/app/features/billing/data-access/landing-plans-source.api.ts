import {
  CANONICAL_PLAN_CODES,
  normalizePlanCode,
  PLAN_ENTITLEMENTS,
  type CanonicalPlanCode,
  type PlanCode
} from '../../../core/plans/plan-entitlements';

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
  checkoutProvider: 'mercado_pago';
};

type PlanEntitlementRow = {
  plan_code?: string | null;
  max_locales?: number | null;
  max_rubros?: number | null;
  max_monthly_bookings?: number | null;
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
    checkoutProvider: 'mercado_pago'
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
      checkoutProvider: 'mercado_pago'
    });
  }

  return LANDING_PLAN_ORDER.map((code) => byCode.get(code) ?? fallbackByCode.get(code)).filter(
    (plan): plan is LandingPlanViewModel => Boolean(plan)
  );
}

export async function fetchLandingPlans(): Promise<LandingPlanViewModel[]> {
  const maybeSource = globalThis as {
    __LANDING_PLAN_ENTITLEMENTS__?: PlanEntitlementRow[];
  };

  const sourceRows = maybeSource.__LANDING_PLAN_ENTITLEMENTS__;
  if (Array.isArray(sourceRows) && sourceRows.length > 0) {
    return fromPlanEntitlementsRows(sourceRows);
  }

  return getLandingPlansFallback();
}
