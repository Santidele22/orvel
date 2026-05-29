import {
  CatalogCategory,
  CatalogService,
  normalizeCatalogName,
  normalizeCatalogSlug
} from './onboarding-templates';

export type EditableCatalog = {
  categories: CatalogCategory[];
  services: CatalogService[];
};

function categoryRefKey(category: CatalogCategory): string {
  const slug = normalizeCatalogSlug(category.slug);
  if (slug) {
    return `slug:${slug}`;
  }

  const name = normalizeCatalogName(category.name);
  return name ? `name:${name}` : '';
}

function serviceRefKey(service: CatalogService): string {
  const slug = normalizeCatalogSlug(service.slug);
  if (slug) {
    return `slug:${slug}`;
  }

  const name = normalizeCatalogName(service.name);
  return name ? `name:${name}` : '';
}

function sanitizeCategory(input: CatalogCategory): CatalogCategory {
  const slug = normalizeCatalogSlug(input.slug);
  return {
    ...(slug ? { slug } : {}),
    name: input.name.trim()
  };
}

function sanitizeService(input: CatalogService): CatalogService {
  const slug = normalizeCatalogSlug(input.slug);
  const categorySlug = normalizeCatalogSlug(input.categorySlug);

  return {
    ...(slug ? { slug } : {}),
    name: input.name.trim(),
    ...(categorySlug ? { categorySlug } : {}),
    baseDurationMinutes: Number.isFinite(input.baseDurationMinutes) ? input.baseDurationMinutes : 0
  };
}

export function addCategory(catalog: EditableCatalog, category: CatalogCategory): EditableCatalog {
  const normalized = sanitizeCategory(category);
  const key = categoryRefKey(normalized);

  if (!key || catalog.categories.some((item) => categoryRefKey(item) === key)) {
    return catalog;
  }

  return {
    ...catalog,
    categories: [...catalog.categories, normalized]
  };
}

export function deleteCategory(catalog: EditableCatalog, categoryRef: string): EditableCatalog {
  const normalizedRef = normalizeCatalogSlug(categoryRef) || normalizeCatalogName(categoryRef);

  if (!normalizedRef) {
    return catalog;
  }

  const categories = catalog.categories.filter((category) => {
    const slug = normalizeCatalogSlug(category.slug);
    const name = normalizeCatalogName(category.name);
    return slug !== normalizedRef && name !== normalizedRef;
  });

  const services = catalog.services.filter((service) => normalizeCatalogSlug(service.categorySlug) !== normalizedRef);

  return {
    ...catalog,
    categories,
    services
  };
}

export function addService(catalog: EditableCatalog, service: CatalogService): EditableCatalog {
  const normalized = sanitizeService(service);
  const key = serviceRefKey(normalized);

  if (!key || catalog.services.some((item) => serviceRefKey(item) === key)) {
    return catalog;
  }

  return {
    ...catalog,
    services: [...catalog.services, normalized]
  };
}

export function updateService(
  catalog: EditableCatalog,
  serviceRef: string,
  patch: Partial<CatalogService>
): EditableCatalog {
  const normalizedRef = normalizeCatalogSlug(serviceRef) || normalizeCatalogName(serviceRef);

  if (!normalizedRef) {
    return catalog;
  }

  const services = catalog.services.map((service) => {
    const slug = normalizeCatalogSlug(service.slug);
    const name = normalizeCatalogName(service.name);
    const matches = slug === normalizedRef || name === normalizedRef;

    if (!matches) {
      return service;
    }

    return sanitizeService({ ...service, ...patch });
  });

  return {
    ...catalog,
    services
  };
}

export function deleteService(catalog: EditableCatalog, serviceRef: string): EditableCatalog {
  const normalizedRef = normalizeCatalogSlug(serviceRef) || normalizeCatalogName(serviceRef);

  if (!normalizedRef) {
    return catalog;
  }

  return {
    ...catalog,
    services: catalog.services.filter((service) => {
      const slug = normalizeCatalogSlug(service.slug);
      const name = normalizeCatalogName(service.name);
      return slug !== normalizedRef && name !== normalizedRef;
    })
  };
}
