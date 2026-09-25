import { describe, expect, it } from 'vitest';

type PlanCode = 'FREE' | 'PREMIUM' | 'BASIC' | 'MEDIUM' | 'STARTER' | 'GROWTH' | 'PRO';

type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null;
  aiCreditsMonthly: number;
};

type PlanEntitlementsModule = {
  PLAN_ENTITLEMENTS: Record<PlanCode, PlanEntitlements>;
  getPlanEntitlements: (plan: unknown) => PlanEntitlements;
};

type ReferenceCatalogModule = {
  getDefaultDashboardReferenceCatalog: () => {
    plans: Array<{ code: string; label: string } & PlanEntitlements>;
  };
};

async function loadPlanEntitlementsModule(): Promise<PlanEntitlementsModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/plans/plan-entitlements');
  } catch {
    throw new Error(
      'Missing shared module src/app/core/plans/plan-entitlements.ts with PLAN_ENTITLEMENTS and getPlanEntitlements(plan).'
    );
  }

  const PLAN_ENTITLEMENTS = module['PLAN_ENTITLEMENTS'] as PlanEntitlementsModule['PLAN_ENTITLEMENTS'] | undefined;
  const getPlanEntitlements = module['getPlanEntitlements'] as PlanEntitlementsModule['getPlanEntitlements'] | undefined;

  if (!PLAN_ENTITLEMENTS || !getPlanEntitlements) {
    throw new Error(
      'Missing exports PLAN_ENTITLEMENTS and getPlanEntitlements(plan) in src/app/core/plans/plan-entitlements.ts'
    );
  }

  return { PLAN_ENTITLEMENTS, getPlanEntitlements };
}

async function loadReferenceCatalogModule(): Promise<ReferenceCatalogModule> {
  return (await import('../../core/catalog/reference-catalog')) as ReferenceCatalogModule;
}

function catalogEntitlementsByCode(catalog: ReturnType<ReferenceCatalogModule['getDefaultDashboardReferenceCatalog']>) {
  return Object.fromEntries(
    catalog.plans.map((plan) => [
      plan.code,
      {
        maxLocales: plan.maxLocales,
        maxRubros: plan.maxRubros,
        maxMonthlyBookings: plan.maxMonthlyBookings,
        aiCreditsMonthly: plan.aiCreditsMonthly
      } satisfies PlanEntitlements
    ])
  );
}

describe('RED contract: shared plan entitlements matrix', () => {
  it('matches canonical FREE/PREMIUM salon limits from the reference catalog', async () => {
    const [{ PLAN_ENTITLEMENTS }, referenceCatalog] = await Promise.all([
      loadPlanEntitlementsModule(),
      loadReferenceCatalogModule()
    ]);
    const catalogPlans = catalogEntitlementsByCode(referenceCatalog.getDefaultDashboardReferenceCatalog());

    expect(PLAN_ENTITLEMENTS.FREE).toEqual(catalogPlans['FREE']);
    expect(PLAN_ENTITLEMENTS.PREMIUM).toEqual(catalogPlans['PREMIUM']);
  });

  it('resolves plan keys deterministically (case-insensitive) and falls back to the FREE catalog plan', async () => {
    const [{ getPlanEntitlements }, referenceCatalog] = await Promise.all([
      loadPlanEntitlementsModule(),
      loadReferenceCatalogModule()
    ]);
    const catalogPlans = catalogEntitlementsByCode(referenceCatalog.getDefaultDashboardReferenceCatalog());

    expect(getPlanEntitlements('free')).toEqual(catalogPlans['FREE']);
    expect(getPlanEntitlements('premium')).toEqual(catalogPlans['PREMIUM']);
    expect(getPlanEntitlements('BASIC')).toEqual(catalogPlans['PREMIUM']);
    expect(getPlanEntitlements('medium')).toEqual(catalogPlans['PREMIUM']);
    expect(getPlanEntitlements('starter')).toEqual(catalogPlans['PREMIUM']);
    expect(getPlanEntitlements('growth')).toEqual(catalogPlans['PREMIUM']);
    expect(getPlanEntitlements('PRO')).toEqual(catalogPlans['PREMIUM']);
    expect(getPlanEntitlements('enterprise')).toEqual(catalogPlans['FREE']);
    expect(getPlanEntitlements(null)).toEqual(catalogPlans['FREE']);
  });
});
