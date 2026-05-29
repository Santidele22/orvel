export const REQUIRED_RUBROS = ['peluqueria', 'unas', 'pestanas', 'barberia', 'spa'] as const;

export type RequiredRubro = (typeof REQUIRED_RUBROS)[number];

const REQUIRED_RUBROS_SET = new Set<string>(REQUIRED_RUBROS);

export function normalizeRubro(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
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
