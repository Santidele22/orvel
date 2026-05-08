import { describe, expect, it } from 'vitest';

type RubroSlug = 'peluqueria' | 'unas' | 'pestanas' | 'barberia' | 'spa';

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
    module = await import('../../core/onboarding/onboarding-rubros');
  } catch {
    throw new Error(
      'Missing module src/app/core/onboarding/onboarding-rubros.ts with REQUIRED_RUBROS, sanitizeSelectedRubros() and canContinueOnboarding().'
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
      'Missing exports REQUIRED_RUBROS, sanitizeSelectedRubros(input), canContinueOnboarding(selectedRubros), toggleSelectedRubro(selectedRubros, rubro) in src/app/core/onboarding/onboarding-rubros.ts'
    );
  }

  return { REQUIRED_RUBROS, sanitizeSelectedRubros, canContinueOnboarding, toggleSelectedRubro };
}

describe('TDD contract: onboarding rubro multi-select (1..N)', () => {
  it('supports required rubros exactly as product contract', async () => {
    const { REQUIRED_RUBROS } = await loadOnboardingRubrosModule();

    expect(REQUIRED_RUBROS).toEqual(['peluqueria', 'unas', 'pestanas', 'barberia', 'spa']);
  });

  it('allows selecting 1..N rubros to continue', async () => {
    const { canContinueOnboarding, sanitizeSelectedRubros } = await loadOnboardingRubrosModule();

    expect(canContinueOnboarding(sanitizeSelectedRubros([]))).toBe(false);
    expect(canContinueOnboarding(sanitizeSelectedRubros(['peluqueria']))).toBe(true);
    expect(canContinueOnboarding(sanitizeSelectedRubros(['peluqueria', 'spa', 'barberia']))).toBe(true);
  });

  it('toggles selected rubros deterministically and keeps canContinue in sync', async () => {
    const { toggleSelectedRubro, canContinueOnboarding } = await loadOnboardingRubrosModule();

    const afterFirstToggle = toggleSelectedRubro([], 'peluqueria');
    expect(afterFirstToggle).toEqual(['peluqueria']);
    expect(canContinueOnboarding(afterFirstToggle)).toBe(true);

    const afterSecondToggle = toggleSelectedRubro(afterFirstToggle, 'spa');
    expect(afterSecondToggle).toEqual(['peluqueria', 'spa']);
    expect(canContinueOnboarding(afterSecondToggle)).toBe(true);

    const afterThirdToggle = toggleSelectedRubro(afterSecondToggle, 'peluqueria');
    expect(afterThirdToggle).toEqual(['spa']);
    expect(canContinueOnboarding(afterThirdToggle)).toBe(true);

    const afterFourthToggle = toggleSelectedRubro(afterThirdToggle, 'spa');
    expect(afterFourthToggle).toEqual([]);
    expect(canContinueOnboarding(afterFourthToggle)).toBe(false);
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
      'fotografia',
      null,
      100
    ]);

    expect(selected).toEqual(['peluqueria', 'unas', 'pestanas', 'barberia', 'spa']);
  });
});
