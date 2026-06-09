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

import {
  resolveBusinessTypeCodeFromCatalog
} from '../../../core/catalog/reference-catalog';
import { getRuntimeReferenceCatalogSnapshot } from '../../../core/catalog/reference-catalog.gateway';

export type BusinessTypeCode =
  | 'peluqueria'
  | 'unas'
  | 'barberia'
  | 'spa'
  | 'pestanas'
  | 'cejas'
  | 'masajes'
  | 'otro';

export const ONBOARDING_BUSINESS_TYPES_STORAGE_KEY = 'turnea.onboarding.rubros.v1';

const REFERENCE_CATALOG = getRuntimeReferenceCatalogSnapshot();

function normalizeBusinessTypeCode(value: unknown): BusinessTypeCode | null {
  const resolved = resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, value);
  if (!resolved) {
    return null;
  }

  return resolved.toLowerCase() as BusinessTypeCode;
}

/**
 * Persists the selected business types to storage.
 * @param storage - Storage-like object (localStorage, sessionStorage, etc.)
 * @param types - Array of business type codes to persist
 */
export function persistBusinessTypes(storage: Pick<Storage, 'setItem'>, types: BusinessTypeCode[]): void {
  const normalizedTypes = types
    .map((type) => normalizeBusinessTypeCode(type))
    .filter((type): type is BusinessTypeCode => type !== null);

  storage.setItem(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, JSON.stringify(normalizedTypes));
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

    const normalizedTypes = parsed
      .map((item) => normalizeBusinessTypeCode(item))
      .filter((item): item is BusinessTypeCode => item !== null);

    if (normalizedTypes.length !== parsed.length) {
      return null;
    }

    return normalizedTypes;
  } catch {
    // Corrupted JSON, return null
    return null;
  }
}
