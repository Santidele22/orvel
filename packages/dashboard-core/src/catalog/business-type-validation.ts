import { resolveBusinessTypeCodeFromCatalog, type CatalogBusinessType } from './reference-catalog';
import { REFERENCE_CATALOG } from './reference-catalog-snapshot';

/**
 * True when `value` resolves to a business type present in the reference catalog.
 *
 * Catalog-backed validation belongs to `core/catalog` so that `core/*` (for
 * example the dashboard auth guard) does not depend on a feature module.
 */
export function isCatalogBusinessType(value: unknown): boolean {
  const resolved = resolveBusinessTypeCodeFromCatalog(REFERENCE_CATALOG, value);

  return (
    resolved !== null &&
    REFERENCE_CATALOG.businessTypes.some((businessType: CatalogBusinessType) => businessType.code === resolved)
  );
}
