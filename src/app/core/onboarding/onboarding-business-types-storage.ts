/**
 * Onboarding Business Types Storage
 *
 * Handles persistence of selected business types during onboarding flow.
 * Storage key: turnea.onboarding.rubros.v1
 *
 * The storage module provides:
 * - ONBOARDING_BUSINESS_TYPES_STORAGE_KEY: The storage key for business types
 * - persistBusinessTypes(storage, types): Stores the selected business types
 * - readBusinessTypes(storage): Retrieves the stored business types or null
 */

export type BusinessTypeCode = 'peluqueria' | 'unas' | 'barberia' | 'spa';

export const ONBOARDING_BUSINESS_TYPES_STORAGE_KEY = 'turnea.onboarding.rubros.v1';

/**
 * Persists the selected business types to storage.
 * @param storage - Storage-like object (localStorage, sessionStorage, etc.)
 * @param types - Array of business type codes to persist
 */
export function persistBusinessTypes(storage: Pick<Storage, 'setItem'>, types: BusinessTypeCode[]): void {
  storage.setItem(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, JSON.stringify(types));
}

/**
 * Reads the persisted business types from storage.
 * @param storage - Storage-like object
 * @returns Array of business type codes or null if not found/invalid
 */
export function readBusinessTypes(storage: Pick<Storage, 'getItem'>): BusinessTypeCode[] | null {
  try {
    const stored = storage.getItem(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      return null;
    }

    // Validate all items are valid business type codes
    const validTypes: BusinessTypeCode[] = ['peluqueria', 'unas', 'barberia', 'spa'];
    const isValid = parsed.every((item): item is BusinessTypeCode => validTypes.includes(item as BusinessTypeCode));

    if (!isValid) {
      return null;
    }

    return parsed as BusinessTypeCode[];
  } catch {
    // Corrupted JSON, return null
    return null;
  }
}