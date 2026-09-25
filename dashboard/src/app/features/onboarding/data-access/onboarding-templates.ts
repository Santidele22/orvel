// Re-export shim for the @orvel/domain migration window.
// Source moved to packages/domain/src/onboarding-templates.ts (chore-extract-domain-package).
// Deletable once no importer references this old path.
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
} from '@orvel/domain';
