import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null;
  aiCreditsMonthly: number;
};

type PlanEntitlementsModule = {
  CANONICAL_PLAN_CODES: readonly string[];
  PLAN_CODE_ALIASES?: Record<string, string>;
  CANONICAL_PLAN_ENTITLEMENTS?: Record<string, PlanEntitlements>;
  PLAN_ENTITLEMENTS?: Record<string, PlanEntitlements>;
  normalizePlanCode: (plan: unknown) => string;
  getPlanEntitlements: (plan: unknown) => PlanEntitlements;
};

type ReferenceCatalogModule = {
  getDefaultDashboardReferenceCatalog: () => {
    plans: Array<{ code: string } & PlanEntitlements>;
    planAliases: Array<{ alias: string; planCode: string }>;
  };
};

async function loadPlanEntitlementsModule(): Promise<PlanEntitlementsModule> {
  try {
    return (await import('../../core/plans/plan-entitlements')) as PlanEntitlementsModule;
  } catch {
    throw new Error(
      'TODO(BB-8): keep src/app/core/plans/plan-entitlements.ts public API and back it with src/app/core/catalog/reference-catalog.ts.'
    );
  }
}

async function loadReferenceCatalogModule(): Promise<ReferenceCatalogModule> {
  return (await import('../../core/catalog/reference-catalog')) as ReferenceCatalogModule;
}

function readPlanEntitlementsSource(): string {
  const sourcePath = path.join(process.cwd(), 'src', 'app', 'core', 'plans', 'plan-entitlements.ts');
  expect(fs.existsSync(sourcePath), 'Missing plan entitlements source file').toBe(true);
  return fs.readFileSync(sourcePath, 'utf8');
}

describe('RED contract: plan entitlements uses the core reference catalog', () => {
  it('imports the reference catalog and does not keep local source-of-truth matrices', () => {
    const source = readPlanEntitlementsSource();

    expect(source, 'Plan entitlements must import/read the core reference catalog').toMatch(
      /core\/catalog\/reference-catalog|\.\.\/catalog\/reference-catalog/
    );
    expect(source, 'Legacy aliases may be exported only when derived from catalog, not a local object literal').not.toMatch(
      /PLAN_CODE_ALIASES\s*:[^=]+=>?\s*\{[\s\S]*?\}/
    );
    expect(source, 'Canonical entitlements may be exported only when derived from catalog, not a local object literal').not.toMatch(
      /CANONICAL_PLAN_ENTITLEMENTS\s*:[^=]+=>?\s*\{[\s\S]*?\}/
    );
    expect(source, 'Plan entitlements may be exported only when derived from catalog, not a local object literal').not.toMatch(
      /PLAN_ENTITLEMENTS\s*:[^=]+=>?\s*\{[\s\S]*?\}/
    );
  });

  it('derives canonical plan codes and legacy alias normalization from the default catalog', async () => {
    const [planEntitlements, referenceCatalog] = await Promise.all([
      loadPlanEntitlementsModule(),
      loadReferenceCatalogModule()
    ]);
    const catalog = referenceCatalog.getDefaultDashboardReferenceCatalog();

    expect(planEntitlements.CANONICAL_PLAN_CODES).toEqual(catalog.plans.map((plan) => plan.code));
    expect(planEntitlements.CANONICAL_PLAN_CODES).toEqual(['FREE', 'STARTER', 'GROWTH', 'PRO']);
    expect(planEntitlements.normalizePlanCode(' BASIC ')).toBe('STARTER');
    expect(planEntitlements.normalizePlanCode('medium')).toBe('GROWTH');

    if (catalog.planAliases.some((alias) => alias.alias === 'STARTED' && alias.planCode === 'STARTER')) {
      expect(planEntitlements.normalizePlanCode('started')).toBe('STARTER');
    }

    if (planEntitlements.PLAN_CODE_ALIASES) {
      expect(planEntitlements.PLAN_CODE_ALIASES).toEqual(
        Object.fromEntries(catalog.planAliases.map((alias) => [alias.alias, alias.planCode]))
      );
    }
  });

  it('returns max locales, rubros, bookings, and AI credits from catalog entitlements', async () => {
    const [planEntitlements, referenceCatalog] = await Promise.all([
      loadPlanEntitlementsModule(),
      loadReferenceCatalogModule()
    ]);
    const catalog = referenceCatalog.getDefaultDashboardReferenceCatalog();

    for (const catalogPlan of catalog.plans) {
      expect(planEntitlements.getPlanEntitlements(catalogPlan.code), catalogPlan.code).toEqual({
        maxLocales: catalogPlan.maxLocales,
        maxRubros: catalogPlan.maxRubros,
        maxMonthlyBookings: catalogPlan.maxMonthlyBookings,
        aiCreditsMonthly: catalogPlan.aiCreditsMonthly
      });
    }

    expect(planEntitlements.getPlanEntitlements('BASIC')).toEqual(planEntitlements.getPlanEntitlements('STARTER'));
    expect(planEntitlements.getPlanEntitlements('MEDIUM')).toEqual(planEntitlements.getPlanEntitlements('GROWTH'));
  });
});
