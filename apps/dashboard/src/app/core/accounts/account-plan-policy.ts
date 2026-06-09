import {
  getPlanEntitlementsFromCatalog,
  type DashboardReferenceCatalog,
  resolvePlanCodeFromCatalog
} from '../catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../catalog/reference-catalog.gateway';

export type AccountPlanPolicy = {
  accountEnabled: boolean;
  maxSalons: number;
};

function resolvePlanCode(plan: unknown, referenceCatalog: DashboardReferenceCatalog): string {
  return resolvePlanCodeFromCatalog(referenceCatalog, plan) ?? 'FREE';
}

function resolveMaxSalons(plan: unknown, referenceCatalog: DashboardReferenceCatalog): number {
  return getPlanEntitlementsFromCatalog(referenceCatalog, plan)?.maxLocales ?? 1;
}

export function resolveAccountPlanPolicy(input: { plan: unknown; premiumPaid: boolean; referenceCatalog?: DashboardReferenceCatalog }): AccountPlanPolicy {
  const referenceCatalog = input.referenceCatalog ?? getRuntimeReferenceCatalogSnapshot();
  const planCode = resolvePlanCode(input.plan, referenceCatalog);
  const freeMaxSalons = resolveMaxSalons('FREE', referenceCatalog);

  if (planCode === 'FREE') {
    return {
      accountEnabled: true,
      maxSalons: freeMaxSalons
    };
  }

  if (!input.premiumPaid) {
    return {
      accountEnabled: false,
      maxSalons: freeMaxSalons
    };
  }

  return {
    accountEnabled: true,
    maxSalons: resolveMaxSalons(planCode, referenceCatalog)
  };
}

export function canCreateSalonUnderPlan(input: { plan: unknown; premiumPaid: boolean; currentSalons: number }): boolean {
  const policy = resolveAccountPlanPolicy({
    plan: input.plan,
    premiumPaid: input.premiumPaid
  });

  return input.currentSalons < policy.maxSalons;
}
