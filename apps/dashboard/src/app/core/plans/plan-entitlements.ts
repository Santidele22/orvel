import {
  getPlanEntitlementsFromCatalog,
  type DashboardReferenceCatalog,
  resolvePlanCodeFromCatalog
} from '../catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../catalog/reference-catalog.gateway';

export type CanonicalPlanCode = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO';

export type LegacyPlanCode = string;

export type PlanCode = CanonicalPlanCode | LegacyPlanCode;

export type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null; // null for unlimited
  aiCreditsMonthly: number;
};

const DEFAULT_PLAN: CanonicalPlanCode = 'FREE';
const referenceCatalog = getRuntimeReferenceCatalogSnapshot();

export const CANONICAL_PLAN_CODES = referenceCatalog.plans.map((plan) => plan.code) as readonly CanonicalPlanCode[];

export const PLAN_CODE_ALIASES = Object.fromEntries(
  referenceCatalog.planAliases.map((alias) => [alias.alias, alias.planCode as CanonicalPlanCode])
) as Record<LegacyPlanCode, CanonicalPlanCode>;

export const CANONICAL_PLAN_ENTITLEMENTS = Object.fromEntries(
  referenceCatalog.plans.map((plan) => [
    plan.code,
    {
      maxLocales: plan.maxLocales,
      maxRubros: plan.maxRubros,
      maxMonthlyBookings: plan.maxMonthlyBookings,
      aiCreditsMonthly: plan.aiCreditsMonthly
    } satisfies PlanEntitlements
  ])
) as Record<CanonicalPlanCode, PlanEntitlements>;

export const PLAN_ENTITLEMENTS = Object.fromEntries([
  ...referenceCatalog.plans.map((plan) => [plan.code, CANONICAL_PLAN_ENTITLEMENTS[plan.code as CanonicalPlanCode]]),
  ...referenceCatalog.planAliases.map((alias) => [
    alias.alias,
    CANONICAL_PLAN_ENTITLEMENTS[alias.planCode as CanonicalPlanCode]
  ])
]) as Record<PlanCode, PlanEntitlements>;

export function normalizePlanCode(plan: unknown, catalog: DashboardReferenceCatalog = getRuntimeReferenceCatalogSnapshot()): CanonicalPlanCode {
  return (resolvePlanCodeFromCatalog(catalog, plan) as CanonicalPlanCode | null) ?? DEFAULT_PLAN;
}

export function getPlanEntitlements(plan: unknown, catalog: DashboardReferenceCatalog = getRuntimeReferenceCatalogSnapshot()): PlanEntitlements {
  return (
    (getPlanEntitlementsFromCatalog(catalog, plan) as PlanEntitlements | null) ??
    CANONICAL_PLAN_ENTITLEMENTS[DEFAULT_PLAN]
  );
}
