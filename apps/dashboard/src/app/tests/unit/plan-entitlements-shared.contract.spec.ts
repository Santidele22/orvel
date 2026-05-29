import { describe, expect, it } from 'vitest';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'STARTER' | 'GROWTH' | 'PRO';

type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
};

type PlanEntitlementsModule = {
  PLAN_ENTITLEMENTS: Record<PlanCode, PlanEntitlements>;
  getPlanEntitlements: (plan: unknown) => PlanEntitlements;
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

describe('RED contract: shared plan entitlements matrix', () => {
  it('matches canonical starter/growth/pro salon limits matrix with legacy aliases translated cleanly', async () => {
    const { PLAN_ENTITLEMENTS } = await loadPlanEntitlementsModule();

    expect(PLAN_ENTITLEMENTS.STARTER.maxLocales).toBe(3);
    expect(PLAN_ENTITLEMENTS.GROWTH.maxLocales).toBe(4);
    expect(PLAN_ENTITLEMENTS.PRO.maxLocales).toBe(5);
  });

  it('resolves plan keys deterministically (case-insensitive) and falls back to starter salon limit', async () => {
    const { getPlanEntitlements } = await loadPlanEntitlementsModule();

    expect(getPlanEntitlements('free').maxLocales).toBe(3);
    expect(getPlanEntitlements('BASIC').maxLocales).toBe(3);
    expect(getPlanEntitlements('medium').maxLocales).toBe(4);
    expect(getPlanEntitlements('starter').maxLocales).toBe(3);
    expect(getPlanEntitlements('growth').maxLocales).toBe(4);
    expect(getPlanEntitlements('PRO').maxLocales).toBe(5);
    expect(getPlanEntitlements('enterprise').maxLocales).toBe(3);
    expect(getPlanEntitlements(null).maxLocales).toBe(3);
  });
});
