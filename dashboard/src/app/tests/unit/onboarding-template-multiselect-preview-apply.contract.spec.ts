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

type RubroTemplate = {
  id: string;
  rubro: 'peluqueria' | 'unas' | 'pestanas' | 'barberia' | 'spa';
  name: string;
  catalog: TemplateCatalog;
};

type SanitizeSelectedTemplateIdsFn = (input: unknown) => string[];
type BuildTemplatePreviewFn = (input: {
  selectedTemplateIds: unknown;
  templates: RubroTemplate[];
}) => {
  selectedTemplateIds: string[];
  templates: RubroTemplate[];
  mergedCatalog: TemplateCatalog;
};
type ApplyTemplatePreloadFn = (input: {
  selectedTemplateIds: unknown;
  templates: RubroTemplate[];
}) => TemplateCatalog;

async function loadOnboardingTemplatesModule(): Promise<{
  sanitizeSelectedTemplateIds: SanitizeSelectedTemplateIdsFn;
  buildTemplatePreview: BuildTemplatePreviewFn;
  applyTemplatePreload: ApplyTemplatePreloadFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-templates');
  } catch {
    throw new Error(
      'Missing module src/app/features/onboarding/data-access/onboarding-templates.ts with sanitizeSelectedTemplateIds(), buildTemplatePreview() and applyTemplatePreload().'
    );
  }

  const sanitizeSelectedTemplateIds = module['sanitizeSelectedTemplateIds'] as
    | SanitizeSelectedTemplateIdsFn
    | undefined;
  const buildTemplatePreview = module['buildTemplatePreview'] as BuildTemplatePreviewFn | undefined;
  const applyTemplatePreload = module['applyTemplatePreload'] as ApplyTemplatePreloadFn | undefined;

  if (!sanitizeSelectedTemplateIds || !buildTemplatePreview || !applyTemplatePreload) {
    throw new Error(
      'Missing exports sanitizeSelectedTemplateIds(input), buildTemplatePreview(input), applyTemplatePreload(input) in src/app/features/onboarding/data-access/onboarding-templates.ts'
    );
  }

  return { sanitizeSelectedTemplateIds, buildTemplatePreview, applyTemplatePreload };
}

function makeTemplatesFixture(): RubroTemplate[] {
  return [
    {
      id: 'tpl-peluqueria-base',
      rubro: 'peluqueria',
      name: 'Peluquería Base',
      catalog: {
        categories: [{ slug: 'cortes', name: 'Cortes' }],
        services: [{ slug: 'corte-dama', name: 'Corte Dama', categorySlug: 'cortes', baseDurationMinutes: 45 }]
      }
    },
    {
      id: 'tpl-unas-base',
      rubro: 'unas',
      name: 'Uñas Base',
      catalog: {
        categories: [{ slug: 'manicuria', name: 'Manicuría' }],
        services: [
          { slug: 'semi-permanente', name: 'Semi permanente', categorySlug: 'manicuria', baseDurationMinutes: 60 }
        ]
      }
    }
  ];
}

describe('TDD contract: template multi-select + preview/apply', () => {
  it('supports selecting multiple templates and dedupes selectedTemplateIds', async () => {
    const { sanitizeSelectedTemplateIds } = await loadOnboardingTemplatesModule();

    const selected = sanitizeSelectedTemplateIds([
      'tpl-peluqueria-base',
      'tpl-unas-base',
      'tpl-unas-base',
      '  tpl-peluqueria-base  '
    ]);

    expect(selected).toEqual(['tpl-peluqueria-base', 'tpl-unas-base']);
  });

  it('builds preview from selected templates without applying behavior changes', async () => {
    const { buildTemplatePreview } = await loadOnboardingTemplatesModule();
    const templates = makeTemplatesFixture();

    const preview = buildTemplatePreview({
      selectedTemplateIds: ['tpl-peluqueria-base', 'tpl-unas-base'],
      templates
    });

    expect(preview.selectedTemplateIds).toEqual(['tpl-peluqueria-base', 'tpl-unas-base']);
    expect(preview.templates.map((item) => item.id)).toEqual(['tpl-peluqueria-base', 'tpl-unas-base']);
    expect(preview.mergedCatalog.categories.map((item) => item.slug)).toEqual(['cortes', 'manicuria']);
    expect(preview.mergedCatalog.services.map((item) => item.slug)).toEqual(['corte-dama', 'semi-permanente']);
  });

  it('apply preloads categories/services/base durations only', async () => {
    const { applyTemplatePreload } = await loadOnboardingTemplatesModule();
    const templates = makeTemplatesFixture();

    const preloaded = applyTemplatePreload({
      selectedTemplateIds: ['tpl-peluqueria-base', 'tpl-unas-base'],
      templates
    });

    expect(Object.keys(preloaded).sort()).toEqual(['categories', 'services']);
    expect(preloaded.services.every((service) => Number.isFinite(service.baseDurationMinutes))).toBe(true);

    expect((preloaded as Record<string, unknown>)['behaviorMode']).toBeUndefined();
    expect((preloaded as Record<string, unknown>)['templateMode']).toBeUndefined();
    expect((preloaded as Record<string, unknown>)['featureFlags']).toBeUndefined();
  });
});
