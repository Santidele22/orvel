/**
 * Fase 3 of #1098 — the rubro runtime belongs to the core, not to a feature.
 *
 * This code used to live in `features/onboarding/data-access/onboarding-rubros.ts` while
 * `core/auth/mock-login-business-types.ts` imported it back, so the core depended on a feature.
 * The runtime only reads the core reference-catalog snapshot, so it moved here; the feature path
 * survives as a re-export shim for the migration window.
 *
 * The `RequiredRubro` type itself already lives in `@orvel/domain` and is re-exported for callers.
 */
import { resolveBusinessTypeCodeFromCatalog } from './reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from './reference-catalog.gateway';
import type { RequiredRubro } from '@orvel/domain';

export type { RequiredRubro } from '@orvel/domain';

const REFERENCE_CATALOG = getRuntimeReferenceCatalogSnapshot();

export const REQUIRED_RUBROS = REFERENCE_CATALOG.businessTypes.map((businessType) => businessType.code.toLowerCase());

const REQUIRED_RUBROS_SET = new Set<string>(REQUIRED_RUBROS);

export function normalizeRubro(input: unknown): string {
  return resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, input)?.toLowerCase() ?? '';
}

export function dedupeStringArray(items: string[]): string[] {
  return [...new Set(items)];
}

function toRequiredRubro(input: unknown): RequiredRubro | null {
  const normalized = normalizeRubro(input);

  if (!normalized) {
    return null;
  }

  if (REQUIRED_RUBROS_SET.has(normalized)) {
    return normalized as RequiredRubro;
  }

  return null;
}

export function sanitizeSelectedRubros(input: unknown): RequiredRubro[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const selected = input
    .map((value) => toRequiredRubro(value))
    .filter((value): value is RequiredRubro => value !== null);

  return dedupeStringArray(selected) as RequiredRubro[];
}

export function canContinueOnboarding(selectedRubros: unknown): boolean {
  return sanitizeSelectedRubros(selectedRubros).length > 0;
}

export function toggleSelectedRubro(selectedRubros: unknown, rubro: unknown): RequiredRubro[] {
  const currentSelectedRubros = sanitizeSelectedRubros(selectedRubros);
  const normalizedRubro = toRequiredRubro(rubro);

  if (!normalizedRubro) {
    return currentSelectedRubros;
  }

  if (currentSelectedRubros.includes(normalizedRubro)) {
    return currentSelectedRubros.filter((selectedRubro) => selectedRubro !== normalizedRubro);
  }

  return [...currentSelectedRubros, normalizedRubro];
}
