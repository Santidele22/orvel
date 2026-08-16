// @orvel/domain public surface barrel.
// First pure-types extraction of the 7-package pattern; see packages/domain/README.md.

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
} from './reference-catalog';

export {
  applyTemplatePreload,
  buildTemplatePreview,
  mergeTemplateCatalogs,
  normalizeCatalogName,
  normalizeCatalogSlug,
  sanitizeSelectedTemplateIds,
  type CatalogCategory,
  type CatalogService,
  type RubroTemplate,
  type TemplateCatalog,
} from './onboarding-templates';

export type { RequiredRubro } from './required-rubro';
