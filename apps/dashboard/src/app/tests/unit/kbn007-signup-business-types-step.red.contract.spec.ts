/**
 * KBN-007: TDD RED contract tests for onboarding Step 3 - Business Types Selection
 *
 * Product Spec:
 *  - Path: Step 3 of onboarding → after credentials entered in Step 2
 *  - Constraint: Show only business types ALLOWED by the plan selected in Step 1
 *  - Behavior: Select 1+ types → Review → Submit → Onboarding complete
 *
 * Plan-to-Business-Type Rules:
 *  - Business type options are catalog-owned, not defined locally in the component.
 *  - Plans resolve through the Supabase/reference catalog aliases and planBusinessTypes mapping.
 *  - PRO/full-access catalog plans expose every catalog business type.
 *
 * Scope:
 *  1) UI filters by plan - Only allowed types shown based on Step 1 plan
 *  2) Cannot select disallowed - If plan changes, invalid selections cleared
 *  3) Multiple selection - Can select 1 or more (depending on plan limits)
 *  4) Required at least one - Must select to submit
 *  5) Visual feedback - Selected types have distinct styling
 *  6) State persistence - Selected types stored
 *  7) Continue button - Disabled until selection
 *  8) Final submit - Submits all data (plan + credentials + types)
 *  9) Navigation handling - Routes based on plan (FREE→dashboard, paid→billing)
 *  10) Back navigation - Returns to credentials (Step 2)
 */

import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'STARTER' | 'GROWTH' | 'PRO';

type BusinessTypeCode = 'peluqueria' | 'unas' | 'barberia' | 'spa' | 'pestanas' | 'cejas' | 'masajes' | 'otro';

type BusinessType = {
  code: BusinessTypeCode;
  label: string;
};

type OnboardingStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type OnboardingBusinessTypesStorageModule = {
  ONBOARDING_BUSINESS_TYPES_STORAGE_KEY: string;
  persistBusinessTypes: (storage: OnboardingStorageLike, types: BusinessTypeCode[]) => void;
  readBusinessTypes: (storage: OnboardingStorageLike) => BusinessTypeCode[] | null;
};

async function loadOnboardingBusinessTypesStorageModule(): Promise<OnboardingBusinessTypesStorageModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-business-types-storage');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/features/onboarding/data-access/onboarding-business-types-storage.ts exporting ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, persistBusinessTypes(storage, types), readBusinessTypes(storage).'
    );
  }

  const ONBOARDING_BUSINESS_TYPES_STORAGE_KEY = module['ONBOARDING_BUSINESS_TYPES_STORAGE_KEY'] as string | undefined;
  const persistBusinessTypes = module['persistBusinessTypes'] as
    | ((storage: OnboardingStorageLike, types: BusinessTypeCode[]) => void)
    | undefined;
  const readBusinessTypes = module['readBusinessTypes'] as
    | ((storage: OnboardingStorageLike) => BusinessTypeCode[] | null)
    | undefined;

  if (!ONBOARDING_BUSINESS_TYPES_STORAGE_KEY || !persistBusinessTypes || !readBusinessTypes) {
    throw new Error(
      'Missing exports ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, persistBusinessTypes(storage, types), readBusinessTypes(storage) in src/app/features/onboarding/data-access/onboarding-business-types-storage.ts'
    );
  }

  return { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, persistBusinessTypes, readBusinessTypes };
}

type OnboardingPlanStorageModule = {
  ONBOARDING_PLAN_STORAGE_KEY: string;
  readPlanSelection: (storage: OnboardingStorageLike) => PlanCode | null;
};

async function loadOnboardingPlanStorageModule(): Promise<OnboardingPlanStorageModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-plan-storage');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/features/onboarding/data-access/onboarding-plan-storage.ts exporting ONBOARDING_PLAN_STORAGE_KEY, readPlanSelection(storage).'
    );
  }

  const ONBOARDING_PLAN_STORAGE_KEY = module['ONBOARDING_PLAN_STORAGE_KEY'] as string | undefined;
  const readPlanSelection = module['readPlanSelection'] as
    | ((storage: OnboardingStorageLike) => PlanCode | null)
    | undefined;

  if (!ONBOARDING_PLAN_STORAGE_KEY || !readPlanSelection) {
    throw new Error(
      'Missing exports ONBOARDING_PLAN_STORAGE_KEY, readPlanSelection(storage) in src/app/features/onboarding/data-access/onboarding-plan-storage.ts'
    );
  }

  return { ONBOARDING_PLAN_STORAGE_KEY, readPlanSelection };
}

type SignupBusinessTypesComponentModule = {
  SignupBusinessTypesStepPage: {
    new (): {
      allowedTypes: BusinessType[];
      selectedTypes: BusinessTypeCode[];
      canContinue(): boolean;
      canSelect(type: BusinessTypeCode): boolean;
      toggleType(type: BusinessTypeCode): void;
      isTypeSelected(type: BusinessTypeCode): boolean;
      submit(): void;
      submitAsync(): Promise<void>;
      setOnboardingCompletionHandler(handler: ((input: unknown) => Promise<boolean>) | null): void;
      goBack(): void;
    };
  };
};

async function loadSignupBusinessTypesComponent(): Promise<SignupBusinessTypesComponentModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/pages/signup-business-types-step.page');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/features/onboarding/pages/signup-business-types-step.page.ts exporting SignupBusinessTypesStepPage component with allowedTypes, selectedTypes, canContinue(), canSelect(type), toggleType(type), isTypeSelected(type), submit(), goBack().'
    );
  }

  const SignupBusinessTypesStepPage = module['SignupBusinessTypesStepPage'] as
    | SignupBusinessTypesComponentModule['SignupBusinessTypesStepPage']
    | undefined;

  if (!SignupBusinessTypesStepPage) {
    throw new Error(
      'Missing export SignupBusinessTypesStepPage in src/app/features/onboarding/pages/signup-business-types-step.page.ts'
    );
  }

  return { SignupBusinessTypesStepPage };
}

function readBusinessTypesStepSources(): { component: string; html: string } {
  const componentPath = resolve(
    process.cwd(),
    'src/app/features/onboarding/pages/signup-business-types-step.page.ts'
  );
  const htmlPath = resolve(
    process.cwd(),
    'src/app/features/onboarding/pages/signup-business-types-step.page.html'
  );

  const component = existsSync(componentPath) ? readFileSync(componentPath, 'utf-8') : '';
  const html = existsSync(htmlPath) ? readFileSync(htmlPath, 'utf-8') : '';

  return { component, html };
}

function createMemoryStorage(seed?: Record<string, string>): OnboardingStorageLike {
  const map = new Map<string, string>(Object.entries(seed ?? {}));

  const storage = {
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

  installWindowLocalStorage(storage);
  return storage;
}

function installWindowLocalStorage(storage: OnboardingStorageLike): void {
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage
  });

  if (typeof window.dispatchEvent !== 'function') {
    Object.defineProperty(window, 'dispatchEvent', {
      configurable: true,
      value: () => true
    });
  }

  if (typeof globalThis.CustomEvent !== 'function') {
    Object.defineProperty(globalThis, 'CustomEvent', {
      configurable: true,
      value: class CustomEvent<T = unknown> extends Event {
        detail: T;

        constructor(type: string, init?: CustomEventInit<T>) {
          super(type, init);
          this.detail = init?.detail as T;
        }
      }
    });
  }
}

describe('KBN-007.CATALOG - onboarding business types use the reference catalog', () => {
  it('CAT-OBT-001 @RED - component must not define local ALL_BUSINESS_TYPES as source of truth', () => {
    const { component } = readBusinessTypesStepSources();

    expect(component).toMatch(/REFERENCE_CATALOG|getDefaultDashboardReferenceCatalog|getAllowedBusinessTypesForPlan/);
    expect(component, 'Business type options must come from catalog.businessTypes/planBusinessTypes, not a local component array').not.toMatch(
      /export\s+const\s+ALL_BUSINESS_TYPES\s*[:=]/
    );
  });

  it('CAT-OBT-002 @RED - component must not keep a four-item local allowlist', () => {
    const { component } = readBusinessTypesStepSources();

    expect(component, 'Remove local allowlist limited to the legacy four business types').not.toMatch(
      /\[\s*['"]peluqueria['"]\s*,\s*['"]unas['"]\s*,\s*['"]barberia['"]\s*,\s*['"]spa['"]\s*\]/
    );
    expect(component, 'Alias/canonicalization should delegate to catalog helpers, not local switch/list code').toMatch(
      /resolveBusinessTypeCodeFromCatalog|businessTypeAliases|getAllowedBusinessTypesForPlan/
    );
  });

  it('CAT-OBT-003 @RED - PRO plan exposes every catalog business type', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage({ 'turnea.onboarding.plan': 'PRO' });
    installWindowLocalStorage(storage);

    const component = new SignupBusinessTypesStepPage();

    expect(component.allowedTypes.map((type) => type.code)).toEqual([
      'peluqueria',
      'unas',
      'barberia',
      'spa',
      'pestanas',
      'cejas',
      'masajes',
      'otro'
    ]);
  });

  it('CAT-OBT-004 @RED - accented aliases are normalized through catalog helpers into canonical ascii selected codes', async () => {
    const { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY } = await loadOnboardingBusinessTypesStorageModule();
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage({
      'turnea.onboarding.plan': 'PRO',
      [ONBOARDING_BUSINESS_TYPES_STORAGE_KEY]: JSON.stringify(['uñas', 'pestañas'])
    });
    installWindowLocalStorage(storage);

    const component = new SignupBusinessTypesStepPage();

    expect(component.selectedTypes).toEqual(['unas', 'pestanas']);
  });

  it('CAT-OBT-005 @RED - selection and submit persist canonical ascii codes for expanded catalog types', async () => {
    const { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY } = await loadOnboardingBusinessTypesStorageModule();
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage({ 'turnea.onboarding.plan': 'PRO' });
    installWindowLocalStorage(storage);
    const component = new SignupBusinessTypesStepPage();
    component.setOnboardingCompletionHandler(async () => true);

    component.toggleType('pestanas');
    await component.submitAsync();

    expect(JSON.parse(storage.getItem(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY) ?? '[]')).toEqual(['pestanas']);
  });
});

describe('KBN-007.1 - UI filters by plan', () => {
  it('KBN-007.1.1 @RED - FREE plan shows only peluqueria', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    // Set FREE plan from Step 1
    storage.setItem('turnea.onboarding.plan', 'FREE');
    const plan = readPlanSelection(storage);

    expect(plan).toBe('FREE');

    const component = new SignupBusinessTypesStepPage();
    expect(component.allowedTypes.map((t) => t.code)).toEqual(['peluqueria']);
  });

  it('KBN-007.1.2 @RED - BASIC plan shows peluqueria, unas', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    storage.setItem('turnea.onboarding.plan', 'BASIC');
    expect(readPlanSelection(storage)).toBe('STARTER');

    const component = new SignupBusinessTypesStepPage();
    expect(component.allowedTypes.map((t) => t.code)).toContain('peluqueria');
    expect(component.allowedTypes.map((t) => t.code)).toContain('unas');
    expect(component.allowedTypes.length).toBe(2);
  });

  it('KBN-007.1.3 @RED - MEDIUM plan shows peluqueria, unas, barberia', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    storage.setItem('turnea.onboarding.plan', 'MEDIUM');
    expect(readPlanSelection(storage)).toBe('GROWTH');

    const component = new SignupBusinessTypesStepPage();
    const codes = component.allowedTypes.map((t) => t.code);
    expect(codes).toContain('peluqueria');
    expect(codes).toContain('unas');
    expect(codes).toContain('barberia');
    expect(component.allowedTypes.length).toBe(3);
  });

  it('KBN-007.1.4 @RED - PRO plan shows all catalog business types', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    storage.setItem('turnea.onboarding.plan', 'PRO');
    expect(readPlanSelection(storage)).toBe('PRO');

    const component = new SignupBusinessTypesStepPage();
    const codes = component.allowedTypes.map((t) => t.code);
    expect(codes).toContain('peluqueria');
    expect(codes).toContain('unas');
    expect(codes).toContain('barberia');
    expect(codes).toContain('spa');
    expect(codes).toContain('pestanas');
    expect(codes).toContain('cejas');
    expect(codes).toContain('masajes');
    expect(codes).toContain('otro');
    expect(component.allowedTypes.length).toBe(8);
  });

  it('KBN-007.1.5 @RED - template renders catalog-derived business type labels dynamically', async () => {
    const { html } = readBusinessTypesStepSources();

    expect(html).toMatch(/allowedTypes/);
    expect(html).toMatch(/type\.label/);
    expect(html, 'Template should not duplicate catalog labels as static local markup').not.toMatch(/Peluquería[\s\S]*Uñas[\s\S]*Barbería[\s\S]*Spa/i);
  });
});

describe('KBN-007.2 - Cannot select disallowed types', () => {
  it('KBN-007.2.1 @RED - canSelect returns false for disallowed types', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    storage.setItem('turnea.onboarding.plan', 'FREE');
    expect(readPlanSelection(storage)).toBe('FREE');

    const component = new SignupBusinessTypesStepPage();

    // FREE plan: only peluqueria is allowed
    expect(component.canSelect('peluqueria')).toBe(true);
    expect(component.canSelect('unas')).toBe(false);
    expect(component.canSelect('barberia')).toBe(false);
    expect(component.canSelect('spa')).toBe(false);
  });

  it('KBN-007.2.2 @RED - canSelect returns true for allowed types', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    storage.setItem('turnea.onboarding.plan', 'PRO');
    const component = new SignupBusinessTypesStepPage();

    // PRO plan: all types allowed
    expect(component.canSelect('peluqueria')).toBe(true);
    expect(component.canSelect('unas')).toBe(true);
    expect(component.canSelect('barberia')).toBe(true);
    expect(component.canSelect('spa')).toBe(true);
  });

  it('KBN-007.2.3 @RED - toggleType does nothing for disallowed types', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();

    storage.setItem('turnea.onboarding.plan', 'FREE');

    const component = new SignupBusinessTypesStepPage();

    // Try to select disallowed type - should be no-op
    component.toggleType('spa');
    expect(component.isTypeSelected('spa')).toBe(false);
  });
});

describe('KBN-007.3 - Multiple selection', () => {
  it('KBN-007.3.1 @RED - can select one type', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'BASIC');

    const component = new SignupBusinessTypesStepPage();
    component.toggleType('peluqueria');

    expect(component.isTypeSelected('peluqueria')).toBe(true);
    expect(component.selectedTypes).toContain('peluqueria');
  });

  it('KBN-007.3.2 @RED - can select multiple types up to plan limit', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'BASIC');

    const component = new SignupBusinessTypesStepPage();
    component.toggleType('peluqueria');
    component.toggleType('unas');

    expect(component.isTypeSelected('peluqueria')).toBe(true);
    expect(component.isTypeSelected('unas')).toBe(true);
    expect(component.selectedTypes.length).toBe(2);
  });

  it('KBN-007.3.3 @RED - BASIC plan limit is 2 types', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'BASIC');

    const component = new SignupBusinessTypesStepPage();

    // Can select up to 2 for BASIC
    component.toggleType('peluqueria');
    component.toggleType('unas');

    expect(component.canContinue()).toBe(true);
  });

  it('KBN-007.3.4 @RED - MEDIUM plan allows 3 types', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'MEDIUM');

    const component = new SignupBusinessTypesStepPage();

    component.toggleType('peluqueria');
    component.toggleType('unas');
    component.toggleType('barberia');

    expect(component.selectedTypes.length).toBe(3);
    expect(component.canContinue()).toBe(true);
  });

  it('KBN-007.3.5 @RED - selecting same type twice toggles it off', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');

    const component = new SignupBusinessTypesStepPage();

    component.toggleType('peluqueria');
    expect(component.isTypeSelected('peluqueria')).toBe(true);

    component.toggleType('peluqueria');
    expect(component.isTypeSelected('peluqueria')).toBe(false);
  });
});

describe('KBN-007.4 - Required at least one type', () => {
  it('KBN-007.4.1 @RED - canContinue returns false when no type selected', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');

    const component = new SignupBusinessTypesStepPage();
    expect(component.canContinue()).toBe(false);
  });

  it('KBN-007.4.2 @RED - canContinue returns true when at least one type selected', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');

    const component = new SignupBusinessTypesStepPage();
    component.toggleType('peluqueria');

    expect(component.canContinue()).toBe(true);
  });
});

describe('KBN-007.5 - Visual feedback for selected types', () => {
  it('KBN-007.5.1 @RED - template has conditional styling for selected types', async () => {
    const { html } = readBusinessTypesStepSources();

    // Should have [class.selected] or [class.active] or similar
    expect(html).toMatch(/\[class\.\w*selected\w*\]|selected.*type|type.*selected/i);
  });

  it('KBN-007.5.2 @RED - isTypeSelected method works correctly', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');

    const component = new SignupBusinessTypesStepPage();

    component.toggleType('unas');
    expect(component.isTypeSelected('unas')).toBe(true);
    expect(component.isTypeSelected('peluqueria')).toBe(false);
  });

  it('KBN-007.5.3 @RED - template uses checkbox or multi-select pattern', async () => {
    const { html } = readBusinessTypesStepSources();

    // Should use a multi-select card/checkbox pattern, NOT radio buttons (single-select)
    expect(html).toMatch(/type="checkbox"|type='checkbox'|\[checked\]|\[class\.selected\]|isTypeSelected/i);
    expect(html).not.toMatch(/type="radio"|type='radio'/i);
  });
});

describe('KBN-007.6 - State persistence', () => {
  it('KBN-007.6.1 @RED - persists business types to onboarding storage', async () => {
    const { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, persistBusinessTypes, readBusinessTypes } =
      await loadOnboardingBusinessTypesStorageModule();
    const storage = createMemoryStorage();

    persistBusinessTypes(storage, ['peluqueria', 'unas']);

    expect(storage.getItem(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY)).toBeDefined();
    expect(readBusinessTypes(storage)).toEqual(['peluqueria', 'unas']);
  });

  it('KBN-007.6.2 @RED - persists multiple types correctly', async () => {
    const { persistBusinessTypes, readBusinessTypes } = await loadOnboardingBusinessTypesStorageModule();
    const storage = createMemoryStorage();

    persistBusinessTypes(storage, ['peluqueria', 'unas', 'barberia']);
    expect(readBusinessTypes(storage)).toEqual(['peluqueria', 'unas', 'barberia']);
  });

  it('KBN-007.6.3 @RED - readBusinessTypes returns null when no data persisted', async () => {
    const { readBusinessTypes } = await loadOnboardingBusinessTypesStorageModule();
    const emptyStorage = createMemoryStorage();

    expect(readBusinessTypes(emptyStorage)).toBeNull();
  });

  it('KBN-007.6.4 @RED - storage key matches spec: turnea.onboarding.v1', async () => {
    const { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY } = await loadOnboardingBusinessTypesStorageModule();

    expect(ONBOARDING_BUSINESS_TYPES_STORAGE_KEY).toMatch(/turnea\.onboarding/i);
  });
});

describe('KBN-007.7 - Continue/Submit button state', () => {
  it('KBN-007.7.1 @RED - template has [disabled] binding on submit button', async () => {
    const { html } = readBusinessTypesStepSources();

    expect(html).toMatch(/\[disabled\]/);
    expect(html).toMatch(/Completar|Finalizar|Submit|Subir/i);
  });

  it('KBN-007.7.2 @RED - submit button disabled when no type selected', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');

    const component = new SignupBusinessTypesStepPage();
    expect(component.canContinue()).toBe(false);
  });

  it('KBN-007.7.3 @RED - submit button enabled after type selection', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');

    const component = new SignupBusinessTypesStepPage();
    component.toggleType('peluqueria');

    expect(component.canContinue()).toBe(true);
  });
});

describe('KBN-007.8 - Final submit completes onboarding', () => {
  it('KBN-007.8.1 @RED - component has submit() method', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const component = new SignupBusinessTypesStepPage();

    expect(typeof component.submit).toBe('function');
  });

  it('KBN-007.8.2 @RED - submit() persists all onboarding data', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const storage = createMemoryStorage();

    storage.setItem('turnea.onboarding.plan', 'PRO');
    storage.setItem('turnea.onboarding.credentials', JSON.stringify({
      email: 'test@example.com',
      full_name: 'Test User',
      business_name: 'Test Salon'
    }));

    const component = new SignupBusinessTypesStepPage();
    component.toggleType('peluqueria');
    component.toggleType('unas');

    component.setOnboardingCompletionHandler(async () => true);

    // submitAsync() should persist business types before mandatory completion succeeds
    await component.submitAsync();

    const { readBusinessTypes } = await loadOnboardingBusinessTypesStorageModule();
    expect(readBusinessTypes(storage)).toEqual(['peluqueria', 'unas']);
  });
});

describe('KBN-007.9 - Navigation based on plan', () => {
  it('KBN-007.9.1 @RED - FREE plan routes to dashboard after submit', async () => {
    const { component } = readBusinessTypesStepSources();

    // Should route to dashboard for FREE plan
    expect(component).toMatch(/dashboard|home|principal/i);
  });

  it('KBN-007.9.2 @RED - Paid plans route to billing/payment', async () => {
    const { component } = readBusinessTypesStepSources();

    // Should route to billing for paid plans
    expect(component).toMatch(/billing|pago|payment|payment-method/i);
  });

  it('KBN-007.9.3 @RED - template button triggers submit action', async () => {
    const { html } = readBusinessTypesStepSources();

    expect(html).toMatch(/\(click\)=.*submit|\(click\)=.*onSubmit/i);
  });
});

describe('KBN-007.10 - Back navigation', () => {
  it('KBN-007.10.1 @RED - component has goBack() method', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const component = new SignupBusinessTypesStepPage();

    expect(typeof component.goBack).toBe('function');
  });

  it('KBN-007.10.2 @RED - template has back button', async () => {
    const { html } = readBusinessTypesStepSources();

    expect(html).toMatch(/Volver|Atrás|Atras|Retroceder/i);
  });

  it('KBN-007.10.3 @RED - back button has (click) binding to goBack()', async () => {
    const { html } = readBusinessTypesStepSources();

    expect(html).toMatch(/\(click\)=.*goBack/i);
  });

  it('KBN-007.10.4 @RED - goBack navigates to credentials step (Step 2)', async () => {
    const { component }: { component: string } = readBusinessTypesStepSources();

    // Should route back to credentials step
    expect(component).toMatch(/signup-credentials|step-2|credenciales/i);
  });
});

describe('KBN-007.11 - Edge cases', () => {
  it('KBN-007.11.1 - storage handles corrupted JSON gracefully', async () => {
    const { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY, readBusinessTypes } =
      await loadOnboardingBusinessTypesStorageModule();
    const corruptedStorage = createMemoryStorage({
      [ONBOARDING_BUSINESS_TYPES_STORAGE_KEY]: '{bad-json'
    });

    expect(readBusinessTypes(corruptedStorage)).toBeNull();
  });

  it('KBN-007.11.2 @RED - when no plan in storage, defaults to catalog STARTER', async () => {
    const { SignupBusinessTypesStepPage } = await loadSignupBusinessTypesComponent();
    const emptyStorage = createMemoryStorage();

    const { readPlanSelection } = await loadOnboardingPlanStorageModule();
    const plan = readPlanSelection(emptyStorage);

    // No stored plan: component falls back to the catalog starter plan.
    expect(plan).toBeNull();

    const component = new SignupBusinessTypesStepPage();
    expect(component.allowedTypes.map((t) => t.code)).toEqual(['peluqueria', 'unas']);
  });

  it('KBN-007.11.3 @RED - reads persisted plan aliases from Step 1 storage as canonical catalog plans', async () => {
    const { readPlanSelection } = await loadOnboardingPlanStorageModule();
    const storage = createMemoryStorage();

    // Simulate Step 1 persisted a plan
    storage.setItem('turnea.onboarding.plan', 'MEDIUM');
    const plan = readPlanSelection(storage);

    expect(plan).toBe('GROWTH');
  });
});
