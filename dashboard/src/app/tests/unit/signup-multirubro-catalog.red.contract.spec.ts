import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import type { Servicio } from '../../models/servicio.model';

type RubroCode = 'peluqueria' | 'unas' | 'barberia' | 'spa' | 'pestanas' | 'cejas' | 'masajes' | 'otro';

type SuggestedService = Pick<Servicio, 'nombre' | 'categoria' | 'duracionMinutos' | 'precio' | 'activo'> & {
  source: 'suggested';
  rubro: RubroCode;
};

type ServiceCatalogSuggestionsModule = {
  getSuggestedServicesForRubros: (rubros: unknown) => SuggestedService[];
  mergeSuggestedWithExistingServices: (input: {
    selectedRubros: unknown;
    existingServices: Array<Pick<Servicio, 'nombre' | 'categoria'>>;
  }) => Array<SuggestedService | Servicio>;
};

async function loadServiceCatalogSuggestions(): Promise<ServiceCatalogSuggestionsModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/servicios/data-access/service-catalog-suggestions');
  } catch {
    throw new Error(
      'Missing src/app/features/servicios/data-access/service-catalog-suggestions.ts with getSuggestedServicesForRubros() and mergeSuggestedWithExistingServices().'
    );
  }

  const getSuggestedServicesForRubros = module['getSuggestedServicesForRubros'] as
    | ServiceCatalogSuggestionsModule['getSuggestedServicesForRubros']
    | undefined;
  const mergeSuggestedWithExistingServices = module['mergeSuggestedWithExistingServices'] as
    | ServiceCatalogSuggestionsModule['mergeSuggestedWithExistingServices']
    | undefined;

  if (!getSuggestedServicesForRubros || !mergeSuggestedWithExistingServices) {
    throw new Error(
      'Missing exports getSuggestedServicesForRubros(selectedRubros) and mergeSuggestedWithExistingServices({ selectedRubros, existingServices }).'
    );
  }

  return { getSuggestedServicesForRubros, mergeSuggestedWithExistingServices };
}

const SIGNUP_BUSINESS_TYPES_PAGE = new URL(
  '../../features/onboarding/pages/signup-business-types-step.page.ts',
  import.meta.url
);

describe('RED contract: signup multi-rubro catalog preload', () => {
  it('signup selection has one required primary rubro and optional additional rubros without hard-capping to one', async () => {
    const { SignupBusinessTypesStepPage } = await import('../../features/onboarding/pages/signup-business-types-step.page');
    const component = new SignupBusinessTypesStepPage();

    expect(component.canContinue()).toBe(false);
    component.toggleType('peluqueria');
    component.toggleType('spa');

    expect(component.canContinue()).toBe(true);
    expect(component.selectedTypes).toEqual(['peluqueria', 'spa']);
    expect(component.getMaxTypes()).toBeGreaterThan(1);
  });

  it('signup source persists every selected rubro and does not use rubro data as an auth/product entitlement limit', async () => {
    const source = await readFile(SIGNUP_BUSINESS_TYPES_PAGE, 'utf8');

    expect(source).not.toMatch(/getMaxTypes\(\)[\s\S]*return\s+1\s*;/);
    expect(source).not.toMatch(/slice\(0,\s*1\)|exactly one|primary service type/i);
    expect(source).toMatch(/primaryRubro|primaryBusinessType|selectedTypes\[0\]/);
    expect(source).toMatch(/additionalRubros|selectedRubros|selectedBusinessTypes/);
    expect(source).toMatch(/selectedBusinessTypes,\s*\n\s*selected_business_types:\s*selectedBusinessTypes,\s*\n\s*additionalRubros/);
    expect(source).not.toMatch(/additionalRubros\.length\s*>\s*0[\s\S]{0,200}selectedBusinessTypes/);
    expect(source).not.toMatch(/entitlement|authorization|not allowed by plan/i);
  });

  it('catalog suggestions are generated from all selected rubros', async () => {
    const { getSuggestedServicesForRubros } = await loadServiceCatalogSuggestions();

    const suggestions = getSuggestedServicesForRubros(['peluqueria', 'unas', 'spa']);

    expect(suggestions.map((service) => service.rubro)).toEqual(expect.arrayContaining(['peluqueria', 'unas', 'spa']));
    expect(suggestions.every((service) => service.source === 'suggested')).toBe(true);
    expect(suggestions.every((service) => service.activo === true)).toBe(true);
  });

  it('Servicios page can show predefined suggestions when no user services exist without blocking custom services', async () => {
    const { mergeSuggestedWithExistingServices } = await loadServiceCatalogSuggestions();

    const merged = mergeSuggestedWithExistingServices({
      selectedRubros: ['peluqueria', 'unas'],
      existingServices: []
    });

    expect(merged.length).toBeGreaterThan(0);
    expect(merged.some((service) => 'source' in service && service.source === 'suggested')).toBe(true);
  });

  it('suggestions never duplicate existing services and preserve custom services', async () => {
    const { getSuggestedServicesForRubros, mergeSuggestedWithExistingServices } = await loadServiceCatalogSuggestions();
    const [suggested] = getSuggestedServicesForRubros(['peluqueria']);
    expect(suggested, 'The peluqueria rubro must have at least one predefined suggestion').toBeDefined();

    const customService: Pick<Servicio, 'nombre' | 'categoria'> = {
      nombre: 'Servicio custom premium',
      categoria: 'Autor'
    };

    const merged = mergeSuggestedWithExistingServices({
      selectedRubros: ['peluqueria'],
      existingServices: [
        { nombre: suggested.nombre, categoria: suggested.categoria },
        customService
      ]
    });

    expect(merged.filter((service) => service.nombre === suggested.nombre && service.categoria === suggested.categoria)).toHaveLength(1);
    expect(merged).toEqual(expect.arrayContaining([expect.objectContaining(customService)]));
  });
});
