import { describe, expect, it } from 'vitest';

type CatalogCategory = {
  slug?: string;
  name: string;
};

type CatalogService = {
  slug?: string;
  name: string;
  categorySlug?: string;
  baseDurationMinutes: number;
};

type TemplateCatalog = {
  categories: CatalogCategory[];
  services: CatalogService[];
};

type MergeTemplateCatalogsFn = (catalogs: TemplateCatalog[]) => TemplateCatalog;

async function loadMergeFn(): Promise<MergeTemplateCatalogsFn> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-templates');
  } catch {
    throw new Error(
      'Missing module src/app/features/onboarding/data-access/onboarding-templates.ts with mergeTemplateCatalogs(catalogs).'
    );
  }

  const mergeTemplateCatalogs = module['mergeTemplateCatalogs'] as MergeTemplateCatalogsFn | undefined;

  if (!mergeTemplateCatalogs) {
    throw new Error(
      'Missing export mergeTemplateCatalogs(catalogs) in src/app/features/onboarding/data-access/onboarding-templates.ts'
    );
  }

  return mergeTemplateCatalogs;
}

describe('TDD contract: merge/dedupe overlap by slug/name normalized', () => {
  it('dedupes categories using slug normalized first', async () => {
    const mergeTemplateCatalogs = await loadMergeFn();

    const merged = mergeTemplateCatalogs([
      {
        categories: [
          { slug: 'coloracion', name: 'Coloración' },
          { slug: 'cortes', name: 'Cortes' }
        ],
        services: []
      },
      {
        categories: [
          { slug: ' COLORACIÓN ', name: 'Coloracion premium' },
          { slug: 'unas-gel', name: 'Uñas Gel' }
        ],
        services: []
      }
    ]);

    expect(merged.categories.map((item) => item.slug)).toEqual(['coloracion', 'cortes', 'unas-gel']);
  });

  it('dedupes services by slug when available, otherwise by normalized name', async () => {
    const mergeTemplateCatalogs = await loadMergeFn();

    const merged = mergeTemplateCatalogs([
      {
        categories: [],
        services: [
          {
            slug: 'corte-hombre',
            name: 'Corte Hombre',
            categorySlug: 'cortes',
            baseDurationMinutes: 30
          },
          {
            name: 'Corte clásico',
            categorySlug: 'cortes',
            baseDurationMinutes: 45
          }
        ]
      },
      {
        categories: [],
        services: [
          {
            slug: '  CORTE-HOMBRE ',
            name: 'Corte Caballero',
            categorySlug: 'cortes',
            baseDurationMinutes: 35
          },
          {
            name: '  corte clasico  ',
            categorySlug: 'cortes',
            baseDurationMinutes: 50
          },
          {
            name: 'Perfilado de Barba',
            categorySlug: 'barberia',
            baseDurationMinutes: 20
          }
        ]
      }
    ]);

    expect(merged.services.map((item) => item.slug ?? item.name)).toEqual([
      'corte-hombre',
      'Corte clásico',
      'Perfilado de Barba'
    ]);

    const classicalCut = merged.services.find((item) => item.slug === undefined && item.name === 'Corte clásico');
    expect(classicalCut?.baseDurationMinutes).toBe(45);
  });
});
