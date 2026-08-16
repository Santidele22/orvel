export type CatalogCategory = {
  slug?: string;
  name: string;
};

export type CatalogService = {
  slug?: string;
  name: string;
  categorySlug?: string;
  baseDurationMinutes: number;
};

export type TemplateCatalog = {
  categories: CatalogCategory[];
  services: CatalogService[];
};

export type RubroTemplate = {
  id: string;
  rubro: 'peluqueria' | 'unas' | 'pestanas' | 'barberia' | 'spa';
  name: string;
  catalog: TemplateCatalog;
};

function normalizeText(input: unknown): string {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export function normalizeCatalogSlug(input: unknown): string {
  return normalizeText(input)
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export function normalizeCatalogName(input: unknown): string {
  return normalizeText(input).replace(/\s+/g, ' ').trim();
}

export function sanitizeSelectedTemplateIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const selectedTemplateIds: string[] = [];
  const seen = new Set<string>();

  for (const value of input) {
    if (typeof value !== 'string') {
      continue;
    }

    const id = value.trim();
    if (!id || seen.has(id)) {
      continue;
    }

    seen.add(id);
    selectedTemplateIds.push(id);
  }

  return selectedTemplateIds;
}

function sanitizeCategory(category: CatalogCategory): CatalogCategory {
  const name = typeof category.name === 'string' ? category.name.trim() : '';
  const normalizedSlug = normalizeCatalogSlug(category.slug);

  return {
    ...(normalizedSlug ? { slug: normalizedSlug } : {}),
    name
  };
}

function sanitizeService(service: CatalogService): CatalogService {
  const name = typeof service.name === 'string' ? service.name.trim() : '';
  const normalizedSlug = normalizeCatalogSlug(service.slug);
  const normalizedCategorySlug = normalizeCatalogSlug(service.categorySlug);

  return {
    ...(normalizedSlug ? { slug: normalizedSlug } : {}),
    name,
    ...(normalizedCategorySlug ? { categorySlug: normalizedCategorySlug } : {}),
    baseDurationMinutes: Number.isFinite(service.baseDurationMinutes)
      ? service.baseDurationMinutes
      : 0
  };
}

export function mergeTemplateCatalogs(catalogs: TemplateCatalog[]): TemplateCatalog {
  const categories: CatalogCategory[] = [];
  const services: CatalogService[] = [];
  const seenCategoryKeys = new Set<string>();
  const seenServiceKeys = new Set<string>();

  for (const catalog of catalogs) {
    for (const rawCategory of catalog.categories ?? []) {
      if (!rawCategory || typeof rawCategory.name !== 'string') {
        continue;
      }

      const category = sanitizeCategory(rawCategory);
      const slugKey = normalizeCatalogSlug(category.slug);
      const nameKey = normalizeCatalogName(category.name);
      const key = slugKey ? `slug:${slugKey}` : nameKey ? `name:${nameKey}` : '';

      if (!key || seenCategoryKeys.has(key)) {
        continue;
      }

      seenCategoryKeys.add(key);
      categories.push(category);
    }

    for (const rawService of catalog.services ?? []) {
      if (!rawService || typeof rawService.name !== 'string') {
        continue;
      }

      const service = sanitizeService(rawService);
      const slugKey = normalizeCatalogSlug(service.slug);
      const nameKey = normalizeCatalogName(service.name);
      const key = slugKey ? `slug:${slugKey}` : nameKey ? `name:${nameKey}` : '';

      if (!key || seenServiceKeys.has(key)) {
        continue;
      }

      seenServiceKeys.add(key);
      services.push(service);
    }
  }

  return { categories, services };
}

export function buildTemplatePreview(input: {
  selectedTemplateIds: unknown;
  templates: RubroTemplate[];
}): {
  selectedTemplateIds: string[];
  templates: RubroTemplate[];
  mergedCatalog: TemplateCatalog;
} {
  const selectedTemplateIds = sanitizeSelectedTemplateIds(input.selectedTemplateIds);
  const byId = new Map<string, RubroTemplate>((input.templates ?? []).map((template) => [template.id, template]));

  const templates = selectedTemplateIds
    .map((id) => byId.get(id))
    .filter((template): template is RubroTemplate => !!template);

  const mergedCatalog = mergeTemplateCatalogs(templates.map((template) => template.catalog));

  return {
    selectedTemplateIds,
    templates,
    mergedCatalog
  };
}

export function applyTemplatePreload(input: {
  selectedTemplateIds: unknown;
  templates: RubroTemplate[];
}): TemplateCatalog {
  return buildTemplatePreview(input).mergedCatalog;
}
