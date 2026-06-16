import { describe, expect, it } from 'vitest';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
type RubroSlug = 'peluqueria' | 'unas' | 'pestanas' | 'barberia' | 'spa';

type ApplyPlanLimitToRubrosFn = (input: {
  plan: unknown;
  selectedRubros: unknown;
}) => RubroSlug[];

type CanAddLocaleFn = (input: {
  plan: unknown;
  currentLocales: unknown;
}) => boolean;

async function loadPlanEditingRulesModule(): Promise<{
  applyPlanLimitToRubros: ApplyPlanLimitToRubrosFn;
  canAddLocale: CanAddLocaleFn;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-plan-rules');
  } catch {
    throw new Error(
      'Missing module src/app/features/onboarding/data-access/onboarding-plan-rules.ts with applyPlanLimitToRubros() and canAddLocale().'
    );
  }

  const applyPlanLimitToRubros = module['applyPlanLimitToRubros'] as ApplyPlanLimitToRubrosFn | undefined;
  const canAddLocale = module['canAddLocale'] as CanAddLocaleFn | undefined;

  if (!applyPlanLimitToRubros || !canAddLocale) {
    throw new Error(
      'Missing exports applyPlanLimitToRubros(input) and canAddLocale(input) in src/app/features/onboarding/data-access/onboarding-plan-rules.ts'
    );
  }

  return { applyPlanLimitToRubros, canAddLocale };
}

describe('RED contract: post-onboarding edit remains allowed but plan-constrained', () => {
  it('allows post-onboarding rubro edits up to maxRubros and trims over-limit selections by plan', async () => {
    const { applyPlanLimitToRubros } = await loadPlanEditingRulesModule();

    const candidateRubros: RubroSlug[] = ['peluqueria', 'unas', 'pestanas', 'barberia', 'spa'];

    expect(
      applyPlanLimitToRubros({ plan: 'FREE', selectedRubros: candidateRubros }),
      'FREE maxRubros=1 should keep exactly one rubro on edit.'
    ).toHaveLength(1);

    expect(
      applyPlanLimitToRubros({ plan: 'BASIC', selectedRubros: candidateRubros }),
      'BASIC maxRubros=1 should keep exactly one rubro on edit.'
    ).toHaveLength(1);

    expect(
      applyPlanLimitToRubros({ plan: 'MEDIUM', selectedRubros: candidateRubros }),
      'MEDIUM maxRubros=3 should keep exactly three rubros on edit.'
    ).toHaveLength(3);

    expect(
      applyPlanLimitToRubros({ plan: 'PRO', selectedRubros: candidateRubros }),
      'PRO maxRubros=10 should keep all selected rubros when under limit.'
    ).toHaveLength(5);
  });

  it('allows salon/locale creation only under approved per-plan maxLocales limits', async () => {
    const { canAddLocale } = await loadPlanEditingRulesModule();

    const expectedByPlan: Record<PlanCode, { acceptsAt: number; rejectsAt: number }> = {
      FREE: { acceptsAt: 0, rejectsAt: 1 },
      BASIC: { acceptsAt: 0, rejectsAt: 1 },
      MEDIUM: { acceptsAt: 0, rejectsAt: 1 },
      PRO: { acceptsAt: 0, rejectsAt: 1 }
    };

    (Object.keys(expectedByPlan) as PlanCode[]).forEach((plan) => {
      expect(
        canAddLocale({ plan, currentLocales: expectedByPlan[plan].acceptsAt }),
        `${plan} should allow adding locales below maxLocales`
      ).toBe(true);

      expect(
        canAddLocale({ plan, currentLocales: expectedByPlan[plan].rejectsAt }),
        `${plan} should block adding locales at maxLocales`
      ).toBe(false);
    });
  });
});
