import { describe, expect, it } from 'vitest';
import {
  getDefaultDashboardReferenceCatalog,
  resolveBusinessTypeCodeFromCatalog
} from '../../core/catalog/reference-catalog';

type RubroSlug = 'peluqueria' | 'unas' | 'barberia' | 'spa' | 'pestanas' | 'cejas' | 'masajes' | 'otro';

type SanitizeSelectedRubrosFn = (input: unknown) => RubroSlug[];
type CanContinueOnboardingFn = (selectedRubros: unknown) => boolean;
type ToggleSelectedRubroFn = (selectedRubros: unknown, rubro: unknown) => RubroSlug[];

async function loadOnboardingRubrosModule(): Promise<{
  REQUIRED_RUBROS: readonly RubroSlug[];
  sanitizeSelectedRubros: SanitizeSelectedRubrosFn;
  canContinueOnboarding: CanContinueOnboardingFn;
  toggleSelectedRubro: ToggleSelectedRubroFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-rubros');
  } catch {
    throw new Error(
      'Missing module src/app/features/onboarding/data-access/onboarding-rubros.ts with REQUIRED_RUBROS, sanitizeSelectedRubros() and canContinueOnboarding().'
    );
  }

  const REQUIRED_RUBROS = module['REQUIRED_RUBROS'] as readonly RubroSlug[] | undefined;
  const sanitizeSelectedRubros = module['sanitizeSelectedRubros'] as
    | SanitizeSelectedRubrosFn
    | undefined;
  const canContinueOnboarding = module['canContinueOnboarding'] as CanContinueOnboardingFn | undefined;
  const toggleSelectedRubro = module['toggleSelectedRubro'] as ToggleSelectedRubroFn | undefined;

  if (!REQUIRED_RUBROS || !sanitizeSelectedRubros || !canContinueOnboarding || !toggleSelectedRubro) {
    throw new Error(
      'Missing exports REQUIRED_RUBROS, sanitizeSelectedRubros(input), canContinueOnboarding(selectedRubros), toggleSelectedRubro(selectedRubros, rubro) in src/app/features/onboarding/data-access/onboarding-rubros.ts'
    );
  }

  return { REQUIRED_RUBROS, sanitizeSelectedRubros, canContinueOnboarding, toggleSelectedRubro };
}

describe('TDD contract: onboarding rubro single-select', () => {
  it('supports rubros from the dashboard reference catalog in catalog sort order', async () => {
    const { REQUIRED_RUBROS } = await loadOnboardingRubrosModule();
    const catalogBusinessTypes = getDefaultDashboardReferenceCatalog().businessTypes;

    expect(REQUIRED_RUBROS).toEqual(catalogBusinessTypes.map((businessType) => businessType.code.toLowerCase()));
    expect(catalogBusinessTypes.map((businessType) => businessType.label)).toEqual([
      'Peluquería',
      'Uñas',
      'Barbería',
      'Spa',
      'Pestañas',
      'Cejas',
      'Masajes',
      'Otro'
    ]);
  });

  it('allows exactly one rubro to continue and trims any extra persisted rubros', async () => {
    const { canContinueOnboarding, sanitizeSelectedRubros } = await loadOnboardingRubrosModule();

    expect(canContinueOnboarding(sanitizeSelectedRubros([]))).toBe(false);
    expect(canContinueOnboarding(sanitizeSelectedRubros(['peluqueria']))).toBe(true);
    expect(sanitizeSelectedRubros(['peluqueria', 'spa', 'barberia'])).toEqual(['peluqueria']);
    expect(sanitizeSelectedRubros(['cejas', 'masajes', 'otro'])).toEqual(['cejas']);
  });

  it('toggles selected rubros deterministically by replacing the previous rubro', async () => {
    const { toggleSelectedRubro, canContinueOnboarding } = await loadOnboardingRubrosModule();

    const afterFirstToggle = toggleSelectedRubro([], 'peluqueria');
    expect(afterFirstToggle).toEqual(['peluqueria']);
    expect(canContinueOnboarding(afterFirstToggle)).toBe(true);

    const afterSecondToggle = toggleSelectedRubro(afterFirstToggle, 'spa');
    expect(afterSecondToggle).toEqual(['spa']);
    expect(canContinueOnboarding(afterSecondToggle)).toBe(true);

    const afterThirdToggle = toggleSelectedRubro(afterSecondToggle, 'spa');
    expect(afterThirdToggle).toEqual([]);
    expect(canContinueOnboarding(afterThirdToggle)).toBe(false);

    const afterFourthToggle = toggleSelectedRubro(afterThirdToggle, 'barberia');
    expect(afterFourthToggle).toEqual(['barberia']);
    expect(canContinueOnboarding(afterFourthToggle)).toBe(true);
  });

  it('normalizes aliases but persists only the first canonical rubro', async () => {
    const { sanitizeSelectedRubros, toggleSelectedRubro } = await loadOnboardingRubrosModule();
    const catalog = getDefaultDashboardReferenceCatalog();

    expect(resolveBusinessTypeCodeFromCatalog(catalog, 'uñas')).toBe('unas');
    expect(resolveBusinessTypeCodeFromCatalog(catalog, 'pestañas')).toBe('pestanas');

    expect(sanitizeSelectedRubros(['uñas', 'Pestañas', 'barbería'])).toEqual(['unas']);
    expect(toggleSelectedRubro(['uñas'], 'pestañas')).toEqual(['pestanas']);
  });

  it('keeps canContinue false when a duplicate click clears the only selected rubro', async () => {
    const { toggleSelectedRubro, canContinueOnboarding } = await loadOnboardingRubrosModule();

    const afterFirstToggle = toggleSelectedRubro([], 'spa');
    expect(afterFirstToggle).toEqual(['spa']);
    expect(canContinueOnboarding(afterFirstToggle)).toBe(true);

    const afterDuplicateToggle = toggleSelectedRubro(afterFirstToggle, 'spa');
    expect(afterDuplicateToggle).toEqual([]);
    expect(canContinueOnboarding(afterDuplicateToggle)).toBe(false);
  });

  it('sanitizes, normalizes and dedupes rubro input', async () => {
    const { sanitizeSelectedRubros } = await loadOnboardingRubrosModule();

    const selected = sanitizeSelectedRubros([
      ' peluqueria ',
      'UÑAS',
      'unas',
      'Pestañas',
      'barberia',
      'Spa',
      'Cejas',
      'MASAJES',
      'Otro',
      'fotografia',
      null,
      100
    ]);

    expect(selected).toEqual(['peluqueria']);
  });
});
