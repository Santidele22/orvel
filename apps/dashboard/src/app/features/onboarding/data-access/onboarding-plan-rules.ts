import {
  getPlanEntitlementsFromCatalog
} from '../../../core/catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../../../core/catalog/reference-catalog.gateway';

const LEGACY_POST_ONBOARDING_MAX_RUBROS: Record<string, number> = {
  BASIC: 1,
  MEDIUM: 3
};

function normalizeLegacyPlanKey(plan: unknown): string | null {
  return typeof plan === 'string' ? plan.trim().toUpperCase() || null : null;
}

function sanitizeStringArray(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function resolveLocaleCount(currentLocales: unknown): number {
  if (Array.isArray(currentLocales)) {
    return currentLocales.length;
  }

  if (typeof currentLocales !== 'number' || Number.isNaN(currentLocales) || currentLocales < 0) {
    return 0;
  }

  return Math.floor(currentLocales);
}

export function applyPlanLimitToRubros(input: { plan: unknown; selectedRubros: unknown }): string[] {
  const referenceCatalog = getRuntimeReferenceCatalogSnapshot();
  const legacyPlan = normalizeLegacyPlanKey(input.plan);
  const maxRubros =
    (legacyPlan ? LEGACY_POST_ONBOARDING_MAX_RUBROS[legacyPlan] : undefined) ??
    getPlanEntitlementsFromCatalog(referenceCatalog, input.plan)?.maxRubros ??
    1;
  const selectedRubros = sanitizeStringArray(input.selectedRubros);
  return selectedRubros.slice(0, maxRubros);
}

export function canAddLocale(input: { plan: unknown; currentLocales: unknown }): boolean {
  const maxLocales = getPlanEntitlementsFromCatalog(getRuntimeReferenceCatalogSnapshot(), input.plan)?.maxLocales ?? 1;
  const currentLocales = resolveLocaleCount(input.currentLocales);
  return currentLocales < maxLocales;
}
