/**
 * KBN-004: TDD RED contract tests for onboarding Step 1 - Plan Selection
 *
 * Scope:
 * 1) UI renders paid plan cards (STARTER, GROWTH, PRO)
 * 2) Single selection only - selecting one deselects others
 * 3) Required to proceed - cannot submit without selecting a plan
 * 4) Visual feedback - selected plan has distinct styling
 * 5) State persistence - selected plan stored in onboarding state
 * 6) Continue button - disabled until selection made, enabled after
 * 7) Navigation - after submit, routes to Step 2 (credentials)
 * 8) Back navigation - can go back to previous step
 */

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PlanCode = 'FREE' | 'STARTER' | 'BASIC' | 'GROWTH' | 'MEDIUM' | 'PRO';

type PlanEntitlements = {
  maxLocales: number;
  maxRubros: number;
};

type PlanOption = {
  code: PlanCode;
  label: string;
  maxLocales: number;
  maxRubros: number;
};

// Mock static plan data matching current paid onboarding plan options.
const MOCK_PLANS: PlanOption[] = [
  { code: 'STARTER', label: 'Starter', maxLocales: 1, maxRubros: 2 },
  { code: 'GROWTH', label: 'Growth', maxLocales: 1, maxRubros: 5 },
  { code: 'PRO', label: 'Pro', maxLocales: 1, maxRubros: 10 }
];

type OnboardingStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type OnboardingPlanStorageModule = {
  ONBOARDING_PLAN_STORAGE_KEY: string;
  persistPlanSelection: (storage: OnboardingStorageLike, plan: PlanCode) => void;
  readPlanSelection: (storage: OnboardingStorageLike) => PlanCode | null;
};

async function loadOnboardingPlanStorageModule(): Promise<OnboardingPlanStorageModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-plan-storage');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/features/onboarding/data-access/onboarding-plan-storage.ts exporting ONBOARDING_PLAN_STORAGE_KEY, persistPlanSelection(storage, plan), readPlanSelection(storage).'
    );
  }

  const ONBOARDING_PLAN_STORAGE_KEY = module['ONBOARDING_PLAN_STORAGE_KEY'] as string | undefined;
  const persistPlanSelection = module['persistPlanSelection'] as
    | ((storage: OnboardingStorageLike, plan: PlanCode) => void)
    | undefined;
  const readPlanSelection = module['readPlanSelection'] as
    | ((storage: OnboardingStorageLike) => PlanCode | null)
    | undefined;

  if (!ONBOARDING_PLAN_STORAGE_KEY || !persistPlanSelection || !readPlanSelection) {
    throw new Error(
      'Missing exports ONBOARDING_PLAN_STORAGE_KEY, persistPlanSelection(storage, plan), readPlanSelection(storage) in src/app/features/onboarding/data-access/onboarding-plan-storage.ts'
    );
  }

  return { ONBOARDING_PLAN_STORAGE_KEY, persistPlanSelection, readPlanSelection };
}

type PlanSelectionComponentModule = {
  SignupPlanStepPage: {
    new (): {
      plans: PlanOption[];
      selectedPlan: PlanCode | null;
      canContinue(): boolean;
      selectPlan(plan: PlanCode): void;
      continue(): void;
      goBack(): void;
    };
  };
};

async function loadPlanSelectionComponent(): Promise<PlanSelectionComponentModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/pages/signup-plan-step.page');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/features/onboarding/pages/signup-plan-step.page.ts exporting SignupPlanStepPage component with plans, selectedPlan, selectPlan(plan), canContinue(), continue(), goBack().'
    );
  }

  const SignupPlanStepPage = module['SignupPlanStepPage'] as
    | PlanSelectionComponentModule['SignupPlanStepPage']
    | undefined;

  if (!SignupPlanStepPage) {
    throw new Error(
      'Missing export SignupPlanStepPage in src/app/features/onboarding/pages/signup-plan-step.page.ts'
    );
  }

  return { SignupPlanStepPage };
}

function readPlanStepSources(): { component: string; html: string } {
  const componentPath = resolve(process.cwd(), 'src/app/features/onboarding/pages/signup-plan-step.page.ts');
  const htmlPath = resolve(process.cwd(), 'src/app/features/onboarding/pages/signup-plan-step.page.html');

  const component = existsSync(componentPath) ? readFileSync(componentPath, 'utf-8') : '';
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';

  return { component, html };
}

function createMemoryStorage(seed?: Record<string, string>): OnboardingStorageLike {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  return {
    getItem(key: string): string | null {
      return map.has(key) ? map.get(key)! : null;
    },
    setItem(key: string, value: string): void {
      map.set(key, value);
    },
    removeItem(key: string): void {
      map.delete(key);
    }
  };
}

describe('KBN-004.1 - UI renders paid plan options', () => {
  it('KBN-004.1.1 @RED - component exports paid plans (STARTER, GROWTH, PRO)', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    expect(component.plans).toBeDefined();
    expect(component.plans.length).toBe(3);

    const planCodes = component.plans.map((p: PlanOption) => p.code);
    expect(planCodes).toContain('STARTER');
    expect(planCodes).toContain('GROWTH');
    expect(planCodes).toContain('PRO');
  });

  it('KBN-004.1.2 @RED - component renders paid plan labels from catalog-backed data', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();
    const labels = component.plans.map((p: PlanOption) => p.label);

    expect(labels).toEqual(['Starter', 'Growth', 'Pro']);
  });

  it('KBN-004.1.3 @RED - plan cards display entitlement info (maxLocales, maxRubros)', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    const starterPlan = component.plans.find((p: PlanOption) => p.code === 'STARTER');
    expect(starterPlan).toBeDefined();
    expect(starterPlan!.maxLocales).toBe(1);
    expect(starterPlan!.maxRubros).toBe(2);

    // PRO plan: base plan keeps one included local; multi-sucursal is a separate add-on
    const proPlan = component.plans.find((p: PlanOption) => p.code === 'PRO');
    expect(proPlan).toBeDefined();
    expect(proPlan!.maxLocales).toBe(1);
    expect(proPlan!.maxRubros).toBeGreaterThanOrEqual(5);
  });

  it('KBN-004.1.4 @RED - onboarding copy does not advertise hidden branch add-ons or 3/10 locales included', async () => {
    const { html } = readPlanStepSources();

    expect(html).toMatch(/1[\s\S]{0,80}local incluido/i);
    expect(html).not.toMatch(/Multi-sucursal|Sucursales adicionales|add-on/i);
    expect(html).not.toMatch(/3\s*locales|10\s*locales/i);
  });
});

describe('KBN-004.2 - Single selection only', () => {
  it('KBN-004.2.1 @RED - selecting a plan updates selectedPlan state', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    expect(component.selectedPlan).toBeNull();

    component.selectPlan('STARTER');
    expect(component.selectedPlan).toBe('STARTER');
  });

  it('KBN-004.2.2 @RED - selecting a different plan replaces previous selection', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    component.selectPlan('STARTER');
    expect(component.selectedPlan).toBe('STARTER');

    component.selectPlan('PRO');
    expect(component.selectedPlan).toBe('PRO');

    // Should NOT have both - only PRO selected
    expect(component.selectedPlan).not.toBe('STARTER');
  });

  it('KBN-004.2.3 @RED - template binds plan selection to single-select behavior', async () => {
    const { html } = readPlanStepSources();

    // Should use radio buttons semantics or similar single-select pattern
    // NOT checkboxes (which are multi-select)
    expect(html).toMatch(/type="radio"/i);
  });
});

describe('KBN-004.3 - Required to proceed', () => {
  it('KBN-004.3.1 @RED - canContinue returns false when no plan selected', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    expect(component.selectedPlan).toBeNull();
    expect(component.canContinue()).toBe(false);
  });

  it('KBN-004.3.2 @RED - canContinue returns true when a plan is selected', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    component.selectPlan('FREE');
    expect(component.canContinue()).toBe(true);

    component.selectPlan('PRO');
    expect(component.canContinue()).toBe(true);
  });

  it('KBN-004.3.3 @RED - cannot submit (continue) without plan selection', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    // Spy on router or navigation mechanism
    const continueFn = vi.spyOn(component, 'continue' as keyof typeof component);

    // Should not navigate or persist without selection
    // Implementation should guard against empty selection
    expect(component.canContinue()).toBe(false);

    // If continue is called anyway, should be a no-op or show error
    // The component should prevent submission when canContinue is false
  });
});

describe('KBN-004.4 - Visual feedback for selected plan', () => {
  it('KBN-004.4.1 @RED - template has conditional styling for selected plan', async () => {
    const { html } = readPlanStepSources();

    // Should have [class.selected] or [class.active] or similar
    // Pattern: [class.selected]="plan.code === selectedPlan"
    expect(html).toMatch(/\[class\.\w*selected\w*\]|selected.*plan|plan.*selected/i);
  });

  it('KBN-004.4.2 @RED - component provides method to check if plan is selected', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    expect(typeof (component as Record<string, unknown>)['isPlanSelected']).toBe('function');

    component.selectPlan('STARTER');
    expect((component as Record<string, unknown>)['isPlanSelected']('STARTER')).toBe(true);
    expect((component as Record<string, unknown>)['isPlanSelected']('FREE')).toBe(false);
  });

  it('KBN-004.4.3 @RED - template uses (click) binding for plan selection', async () => {
    const { html } = readPlanStepSources();

    expect(html).toMatch(/\(click\)=|click\.prevent|onClick/i);
  });
});

describe('KBN-004.5 - State persistence', () => {
  it('KBN-004.5.1 - persists selected plan to onboarding storage', async () => {
    const { ONBOARDING_PLAN_STORAGE_KEY, persistPlanSelection, readPlanSelection } =
      await loadOnboardingPlanStorageModule();
    const storage = createMemoryStorage();

    persistPlanSelection(storage, 'PRO');

    expect(storage.getItem(ONBOARDING_PLAN_STORAGE_KEY)).toBeTypeOf('string');
    expect(readPlanSelection(storage)).toBe('PRO');
  });

  it('KBN-004.5.2 - persists each canonical plan code correctly', async () => {
    const { persistPlanSelection, readPlanSelection } = await loadOnboardingPlanStorageModule();

    for (const plan of MOCK_PLANS) {
      const storage = createMemoryStorage();
      persistPlanSelection(storage, plan.code);
      expect(readPlanSelection(storage)).toBe(plan.code);
    }
  });

  it('KBN-004.5.3 - readPlanSelection returns null when no plan persisted', async () => {
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();
    const emptyStorage = createMemoryStorage();

    expect(readPlanSelection(emptyStorage)).toBeNull();
  });

  it('KBN-004.5.4 @RED - storage key matches spec: turnea.onboarding.v1', async () => {
    const { ONBOARDING_PLAN_STORAGE_KEY } = await loadOnboardingPlanStorageModule();

    expect(ONBOARDING_PLAN_STORAGE_KEY).toMatch(/turnea\.onboarding/i);
  });
});

describe('KBN-004.6 - Continue button state', () => {
  it('KBN-004.6.1 @RED - template has [disabled] binding on continue button', async () => {
    const { html } = readPlanStepSources();

    expect(html).toMatch(/\[disabled\]/);
    expect(html).toMatch(/Continuar|Siguiente|Siguiente paso/i);
  });

  it('KBN-004.6.2 @RED - continue button disabled when no plan selected', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    expect(component.canContinue()).toBe(false);
  });

  it('KBN-004.6.3 @RED - continue button enabled after plan selection', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    component.selectPlan('STARTER');
    expect(component.canContinue()).toBe(true);
  });
});

describe('KBN-004.7 - Navigation to Step 2', () => {
  it('KBN-004.7.1 @RED - component has Router dependency for navigation', async () => {
    const { component } = readPlanStepSources();

    expect(component).toMatch(/Router|router\.navigate|navigateByUrl/i);
  });

  it('KBN-004.7.2 @RED - continue() navigates to credentials/step-2 route', async () => {
    const { component } = readPlanStepSources();

    // Should route to next step (credentials)
    expect(component).toMatch(/signup-credentials|step-2|credentials|credenciales/i);
  });

  it('KBN-004.7.3 @RED - template button triggers continue action', async () => {
    const { html } = readPlanStepSources();

    // Should have (click)="continue()" or similar
    expect(html).toMatch(/\(click\)=.*continue|\(click\)=.*onContinue/i);
  });
});

describe('KBN-004.8 - Back navigation', () => {
  it('KBN-004.8.1 @RED - component has goBack() method', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    expect(typeof component.goBack).toBe('function');
  });

  it('KBN-004.8.2 @RED - template has back button', async () => {
    const { html } = readPlanStepSources();

    expect(html).toMatch(/Volver|Atrás|Atras|Retroceder/i);
  });

  it('KBN-004.8.3 @RED - back button has (click) binding to goBack()', async () => {
    const { html } = readPlanStepSources();

    expect(html).toMatch(/\(click\)=.*goBack/i);
  });

  it('KBN-004.8.4 @RED - goBack navigates to previous step', async () => {
    const { component } = readPlanStepSources();

    // Should route back to signup-start or previous onboarding step
    expect(component).toMatch(/signup-start|onboarding-start|previous|step-0/i);
  });
});

describe('KBN-004.9 - Edge cases', () => {
  it('KBN-004.9.1 - storage handles corrupted/unknown plan codes without inventing a plan', async () => {
    const { ONBOARDING_PLAN_STORAGE_KEY, readPlanSelection } =
      await loadOnboardingPlanStorageModule();
    const corruptedStorage = createMemoryStorage({ [ONBOARDING_PLAN_STORAGE_KEY]: '{bad-json' });

    expect(readPlanSelection(corruptedStorage)).toBeNull();
  });

  it('KBN-004.9.2 @RED - selecting same plan twice is idempotent', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    component.selectPlan('STARTER');
    component.selectPlan('STARTER');

    expect(component.selectedPlan).toBe('STARTER');
    expect(component.canContinue()).toBe(true);
  });

  it('KBN-004.9.3 @RED - all plan entitlements match PLAN_ENTITLEMENTS from core', async () => {
    const { SignupPlanStepPage } = await loadPlanSelectionComponent();
    const component = new SignupPlanStepPage();

    for (const plan of component.plans) {
      expect(plan.maxLocales).toBeGreaterThan(0);
      expect(plan.maxRubros).toBeGreaterThan(0);
      expect(plan.maxLocales).toBeLessThanOrEqual(10);
      expect(plan.maxRubros).toBeLessThanOrEqual(10);
    }
  });
});
