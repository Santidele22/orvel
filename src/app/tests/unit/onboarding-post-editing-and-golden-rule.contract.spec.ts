import { describe, expect, it } from 'vitest';

type CatalogCategory = { slug?: string; name: string };
type CatalogService = {
  slug?: string;
  name: string;
  categorySlug?: string;
  baseDurationMinutes: number;
};

type EditableCatalog = {
  categories: CatalogCategory[];
  services: CatalogService[];
};

type CrudContext = {
  templateMode?: boolean;
  behaviorMode?: 'template' | 'manual';
};

type AddCategoryFn = (catalog: EditableCatalog, category: CatalogCategory, ctx?: CrudContext) => EditableCatalog;
type DeleteCategoryFn = (catalog: EditableCatalog, categoryRef: string, ctx?: CrudContext) => EditableCatalog;
type AddServiceFn = (catalog: EditableCatalog, service: CatalogService, ctx?: CrudContext) => EditableCatalog;
type UpdateServiceFn = (
  catalog: EditableCatalog,
  serviceRef: string,
  patch: Partial<CatalogService>,
  ctx?: CrudContext
) => EditableCatalog;
type DeleteServiceFn = (catalog: EditableCatalog, serviceRef: string, ctx?: CrudContext) => EditableCatalog;
type BuildOnboardingRuntimeFlagsFn = (input: {
  selectedTemplateIds: unknown;
  selectedRubros: unknown;
}) => Record<string, unknown>;

async function loadCatalogCrudModule(): Promise<{
  addCategory: AddCategoryFn;
  deleteCategory: DeleteCategoryFn;
  addService: AddServiceFn;
  updateService: UpdateServiceFn;
  deleteService: DeleteServiceFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/onboarding/onboarding-catalog-crud');
  } catch {
    throw new Error(
      'Missing module src/app/core/onboarding/onboarding-catalog-crud.ts with addCategory(), deleteCategory(), addService(), updateService(), deleteService().'
    );
  }

  const addCategory = module['addCategory'] as AddCategoryFn | undefined;
  const deleteCategory = module['deleteCategory'] as DeleteCategoryFn | undefined;
  const addService = module['addService'] as AddServiceFn | undefined;
  const updateService = module['updateService'] as UpdateServiceFn | undefined;
  const deleteService = module['deleteService'] as DeleteServiceFn | undefined;

  if (!addCategory || !deleteCategory || !addService || !updateService || !deleteService) {
    throw new Error(
      'Missing CRUD exports in src/app/core/onboarding/onboarding-catalog-crud.ts (addCategory, deleteCategory, addService, updateService, deleteService).'
    );
  }

  return { addCategory, deleteCategory, addService, updateService, deleteService };
}

async function loadGoldenRuleModule(): Promise<BuildOnboardingRuntimeFlagsFn> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../core/onboarding/onboarding-runtime-flags');
  } catch {
    throw new Error(
      'Missing module src/app/core/onboarding/onboarding-runtime-flags.ts with buildOnboardingRuntimeFlags(input).'
    );
  }

  const buildOnboardingRuntimeFlags = module['buildOnboardingRuntimeFlags'] as
    | BuildOnboardingRuntimeFlagsFn
    | undefined;

  if (!buildOnboardingRuntimeFlags) {
    throw new Error(
      'Missing export buildOnboardingRuntimeFlags(input) in src/app/core/onboarding/onboarding-runtime-flags.ts'
    );
  }

  return buildOnboardingRuntimeFlags;
}

function baseCatalog(): EditableCatalog {
  return {
    categories: [{ slug: 'cortes', name: 'Cortes' }],
    services: [{ slug: 'corte-dama', name: 'Corte Dama', categorySlug: 'cortes', baseDurationMinutes: 45 }]
  };
}

describe('TDD contract: post-onboarding free editing + golden rule', () => {
  it('allows full CRUD after template preload regardless of template mode context', async () => {
    const { addCategory, deleteCategory, addService, updateService, deleteService } =
      await loadCatalogCrudModule();

    const manualCtx: CrudContext = { templateMode: false, behaviorMode: 'manual' };
    const templateCtx: CrudContext = { templateMode: true, behaviorMode: 'template' };

    const runCrud = (ctx: CrudContext): EditableCatalog => {
      let catalog = baseCatalog();

      catalog = addCategory(catalog, { slug: 'color', name: 'Color' }, ctx);
      catalog = addService(
        catalog,
        { slug: 'color-raiz', name: 'Color raíz', categorySlug: 'color', baseDurationMinutes: 50 },
        ctx
      );
      catalog = updateService(catalog, 'color-raiz', { baseDurationMinutes: 55 }, ctx);
      catalog = deleteService(catalog, 'corte-dama', ctx);
      catalog = deleteCategory(catalog, 'cortes', ctx);

      return catalog;
    };

    expect(runCrud(templateCtx)).toEqual(runCrud(manualCtx));
    expect(runCrud(templateCtx)).toEqual({
      categories: [{ slug: 'color', name: 'Color' }],
      services: [{ slug: 'color-raiz', name: 'Color raíz', categorySlug: 'color', baseDurationMinutes: 55 }]
    });
  });

  it('golden rule: template selection affects initial content only, never behavior flags', async () => {
    const buildOnboardingRuntimeFlags = await loadGoldenRuleModule();

    const noTemplate = buildOnboardingRuntimeFlags({
      selectedRubros: ['peluqueria'],
      selectedTemplateIds: []
    });
    const multiTemplate = buildOnboardingRuntimeFlags({
      selectedRubros: ['peluqueria', 'unas', 'spa'],
      selectedTemplateIds: ['tpl-peluqueria-base', 'tpl-unas-base']
    });

    expect(multiTemplate).toEqual(noTemplate);
    expect(multiTemplate).toEqual({
      enableServiceCrud: true,
      enableCategoryCrud: true,
      onboardingMode: 'standard'
    });
  });
});
