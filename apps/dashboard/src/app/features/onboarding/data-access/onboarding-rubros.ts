import {
  resolveBusinessTypeCodeFromCatalog
} from '../../../core/catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../../../core/catalog/reference-catalog.gateway';

const REFERENCE_CATALOG = getRuntimeReferenceCatalogSnapshot();

export const REQUIRED_RUBROS = REFERENCE_CATALOG.businessTypes.map((businessType) => businessType.code.toLowerCase());

export type RequiredRubro = (typeof REQUIRED_RUBROS)[number];

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

  return dedupeStringArray(selected).slice(0, 1) as RequiredRubro[];
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

  return [normalizedRubro];
}
