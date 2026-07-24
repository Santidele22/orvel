// Business types catalog for landing and signup
// Canonical source for promoted rubros

export interface BusinessType {
  code: string;
  label: string;
}

const PROMOTED_CODES = ['unas', 'masajes', 'barberia', 'peluqueria'] as const;
const OTHER_CODE = 'otro';

const FULL_CATALOG: BusinessType[] = [
  { code: 'peluqueria', label: 'Peluquería' },
  { code: 'unas', label: 'Uñas' },
  { code: 'barberia', label: 'Barbería' },
  { code: 'masajes', label: 'Masajes' },
  { code: 'otro', label: 'Otro' },
];

/**
 * Fallback static catalog of business types used when the RPC catalog
 * is unavailable. Contains 4 promoted types + "Otro".
 */
export const BUSINESS_TYPES_CATALOG: BusinessType[] = FULL_CATALOG;

/**
 * Returns the 4 promoted business types (is_promoted = true in DB).
 * These are the rubros shown on the landing Features section.
 */
export function getPromotedBusinessTypes(): BusinessType[] {
  return FULL_CATALOG.filter((bt) =>
    (PROMOTED_CODES as readonly string[]).includes(bt.code),
  );
}

/**
 * Returns the 5 options for signup selectors:
 * 4 promoted business types + "Otro" as the final option.
 */
export function getBusinessTypesForSignup(): BusinessType[] {
  return FULL_CATALOG;
}
