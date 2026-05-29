import { getPlanEntitlements } from '../../../core/plans/plan-entitlements';

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
  const { maxRubros } = getPlanEntitlements(input.plan);
  const selectedRubros = sanitizeStringArray(input.selectedRubros);
  return selectedRubros.slice(0, maxRubros);
}

export function canAddLocale(input: { plan: unknown; currentLocales: unknown }): boolean {
  const { maxLocales } = getPlanEntitlements(input.plan);
  const currentLocales = resolveLocaleCount(input.currentLocales);
  return currentLocales < maxLocales;
}
