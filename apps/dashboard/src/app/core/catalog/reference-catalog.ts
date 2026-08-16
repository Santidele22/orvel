// Re-export shim for the @orvel/domain migration window.
// Source moved to packages/domain/src/reference-catalog.ts (chore-extract-domain-package).
// Deletable once no importer references this old path.
export {
  DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE,
  DEV_DASHBOARD_REFERENCE_CATALOG_FIXTURE_PAYLOAD,
  getAllowedBusinessTypesForPlan,
  getCatalogAddOn,
  getDefaultDashboardReferenceCatalog,
  getPlanEntitlementsFromCatalog,
  normalizeDashboardReferenceCatalog,
  resolveBusinessTypeCodeFromCatalog,
  resolvePlanCodeFromCatalog,
  type CatalogAddOn,
  type CatalogBusinessType,
  type CatalogPlan,
  type DashboardReferenceCatalog,
} from '@orvel/domain';
