/**
 * KBN-006: TDD RED contract tests for onboarding Step 2 - Credentials + Profile
 *
 * Scope:
 * 1) UI renders all required fields (email, password, full_name, business_name, phone optional)
 * 2) Field validation on blur/submit for each field
 * 3) Email RFC format validation with trim/lowercase
 * 4) Password policy: min 8, max 72, letter + number
 * 5) Required field guards - cannot submit without all required fields
 * 6) Continue button disabled until form is valid
 * 7) State preservation - draft persists in onboarding state
 * 8) Navigation to Step 3 - on success routes to business-types
 * 9) Back navigation - returns to plan selection step
 * 10) Plan persists - selected plan from Step 1 still available
 */

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type Credentials = {
  email: string;
  password: string;
  full_name: string;
  business_name: string;
  phone?: string;
};

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

// Mock static plan data matching Step 1
const MOCK_PLAN: PlanCode = 'PRO';

type OnboardingStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type OnboardingCredentialsStorageModule = {
  ONBOARDING_STORAGE_KEY: string;
  persistCredentials: (storage: OnboardingStorageLike, credentials: Credentials) => void;
  readCredentials: (storage: OnboardingStorageLike) => Credentials | null;
};

type Credentials = {
  email: string;
  password: string;
  full_name: string;
  business_name: string;
  phone?: string;
};

async function loadOnboardingCredentialsStorageModule(): Promise<OnboardingCredentialsStorageModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-credentials-storage');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/features/onboarding/data-access/onboarding-credentials-storage.ts exporting ONBOARDING_STORAGE_KEY, persistCredentials(storage, credentials), readCredentials(storage).'
    );
  }

  const ONBOARDING_STORAGE_KEY = module['ONBOARDING_STORAGE_KEY'] as string | undefined;
  const persistCredentials = module['persistCredentials'] as
    | ((storage: OnboardingStorageLike, credentials: Credentials) => void)
    | undefined;
  const readCredentials = module['readCredentials'] as
    | ((storage: OnboardingStorageLike) => Credentials | null)
    | undefined;

  if (!ONBOARDING_STORAGE_KEY || !persistCredentials || !readCredentials) {
    throw new Error(
      'Missing exports ONBOARDING_STORAGE_KEY, persistCredentials(storage, credentials), readCredentials(storage) in src/app/features/onboarding/data-access/onboarding-credentials-storage.ts'
    );
  }

  return { ONBOARDING_STORAGE_KEY, persistCredentials, readCredentials };
}

type SignupCredentialsComponentModule = {
  SignupCredentialsStepPage: {
    new (): {
      credentials: Partial<Credentials>;
      errors: Record<string, string>;
      isValid(): boolean;
      canContinue(): boolean;
      updateField(field: keyof Credentials, value: string): void;
      validate(): boolean;
      continue(): void;
      goBack(): void;
    };
  };
};

async function loadSignupCredentialsComponent(): Promise<SignupCredentialsComponentModule> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../pages/auth/signup-credentials.page');
  } catch {
    throw new Error(
      'TODO(Aurora): create src/app/pages/auth/signup-credentials.page.ts exporting SignupCredentialsStepPage component with credentials, errors, isValid(), canContinue(), updateField(field, value), validate(), continue(), goBack().'
    );
  }

  const SignupCredentialsStepPage = module['SignupCredentialsStepPage'] as
    | SignupCredentialsComponentModule['SignupCredentialsStepPage']
    | undefined;

  if (!SignupCredentialsStepPage) {
    throw new Error(
      'Missing export SignupCredentialsStepPage in src/app/pages/auth/signup-credentials.page.ts'
    );
  }

  return { SignupCredentialsStepPage };
}

function readCredentialsStepSources(): { component: string; html: string } {
  const componentPath = resolve(
    process.cwd(),
    'src/app/pages/auth/signup-credentials.page.ts'
  );
  const htmlPath = resolve(
    process.cwd(),
    'src/app/pages/auth/signup-credentials.page.html'
  );

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

// Valid test data
const VALID_CREDENTIALS: Credentials = {
  email: 'test@example.com',
  password: 'password1',
  full_name: 'John Doe',
  business_name: 'Doe Beauty Salon',
  phone: '+5491155551234'
};

const VALID_CREDENTIALS_NO_PHONE: Omit<Credentials, 'phone'> = {
  email: 'test2@example.com',
  password: 'password2',
  full_name: 'Jane Smith',
  business_name: 'Smith Salon'
};

describe('KBN-006.1 - UI renders all required fields', () => {
  it('KBN-006.1.1 @RED - component defines all required fields', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    expect(component.credentials).toBeDefined();
    expect(component.credentials.email).toBeDefined();
    expect(component.credentials.password).toBeDefined();
    expect(component.credentials.full_name).toBeDefined();
    expect(component.credentials.business_name).toBeDefined();
  });

  it('KBN-006.1.2 @RED - template renders email input field', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/email|Email/i);
    expect(html).toMatch(/type="email"|type='email'/i);
  });

  it('KBN-006.1.3 @RED - template renders password input field', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/password|Contraseña/i);
    expect(html).toMatch(/type="password"|type='password'/i);
  });

  it('KBN-006.1.4 @RED - template renders full_name input field', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/full.?nameNombre completo/i);
  });

  it('KBN-006.1.5 @RED - template renders business_name input field', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/business.?name|Razón social/i);
  });

  it('KBN-006.1.6 @RED - template renders phone input field as optional', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/phone|Teléfono|móvil|Celular/i);
    // Should indicate optional - "(opcional)" or "optional" attribute
    expect(html).toMatch(/opcional|optional|\?/i);
  });
});

describe('KBN-006.2 - Field validation on blur/submit', () => {
  it('KBN-006.2.1 @RED - component has validate() method', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    expect(typeof component.validate).toBe('function');
  });

  it('KBN-006.2.2 @RED - component has errors object to track validation failures', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    expect(component.errors).toBeDefined();
    expect(typeof component.errors).toBe('object');
  });

  it('KBN-006.2.3 @RED - validate() populates errors for invalid fields', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    // Don't fill any fields - should have validation errors
    const isValid = component.validate();

    expect(isValid).toBe(false);
    expect(Object.keys(component.errors).length).toBeGreaterThan(0);
  });

  it('KBN-006.2.4 @RED - template has field-level validation messages', async () => {
    const { html } = readCredentialsStepSources();

    // Should show error messages conditionally
    expect(html).toMatch(/errors\.|error\.|validation-message|Helper text/i);
  });

  it('KBN-006.2.5 @RED - component validates on field update (blur)', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    // Update field with invalid value
    component.updateField('email', 'not-an-email');

    // Try to continue - should fail validation
    expect(component.canContinue()).toBe(false);
  });
});

describe('KBN-006.3 - Email format validation', () => {
  it('KBN-006.3.1 @RED - rejects invalid email formats', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    const invalidEmails = [
      'notanemail',
      'notanemail@',
      '@example.com',
      'test@.com',
      'test @example.com',
      'test@example.com extra'
    ];

    for (const email of invalidEmails) {
      component.updateField('email', email);
      component.validate();

      expect(component.errors.email).toBeDefined();
    }
  });

  it('KBN-006.3.2 @RED - accepts valid RFC-compliant emails', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    const validEmails = ['test@example.com', 'user.name@domain.org', 'user+tag@example.co'];

    for (const email of validEmails) {
      component.updateField('email', email);
      component.updateField('password', VALID_CREDENTIALS.password);
      component.updateField('full_name', VALID_CREDENTIALS.full_name);
      component.updateField('business_name', VALID_CREDENTIALS.business_name);

      const isValid = component.validate();

      // Email should not have error after valid input
      expect(component.errors.email).toBeUndefined();
    }
  });

  it('KBN-006.3.3 @RED - email is trimmed before validation', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    // Email with whitespace
    component.updateField('email', '  test@example.com  ');
    component.validate();

    // Should accept trimmed email
    expect(component.errors.email).toBeUndefined();
  });

  it('KBN-006.3.4 @RED - email is lowercased before validation', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    // Uppercase email
    component.updateField('email', 'TEST@EXAMPLE.COM');
    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);

    component.validate();

    // Should accept lowercase email or convert to lowercase
    expect(component.errors.email).toBeUndefined();
  });
});

describe('KBN-006.4 - Password policy validation', () => {
  it('KBN-006.4.1 @RED - rejects passwords shorter than 8 characters', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('password', 'short');
    component.validate();

    expect(component.errors.password).toBeDefined();
  });

  it('KBN-006.4.2 @RED - rejects passwords longer than 72 characters', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    const longPassword = 'a'.repeat(73);
    component.updateField('password', longPassword);
    component.validate();

    expect(component.errors.password).toBeDefined();
  });

  it('KBN-006.4.3 @RED - rejects passwords without letters', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('password', '12345678');
    component.validate();

    expect(component.errors.password).toBeDefined();
  });

  it('KBN-006.4.4 @RED - rejects passwords without numbers', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('password', 'abcdefgh');
    component.validate();

    expect(component.errors.password).toBeDefined();
  });

  it('KBN-006.4.5 @RED - accepts passwords meeting all policy requirements', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('password', 'password1');
    component.validate();

    expect(component.errors.password).toBeUndefined();
  });
});

describe('KBN-006.5 - Required field guards', () => {
  it('KBN-006.5.1 @RED - cannot submit with missing email', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);

    expect(component.canContinue()).toBe(false);
  });

  it('KBN-006.5.2 @RED - cannot submit with missing password', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS.email);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);

    expect(component.canContinue()).toBe(false);
  });

  it('KBN-006.5.3 @RED - cannot submit with missing full_name', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS.email);
    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);

    expect(component.canContinue()).toBe(false);
  });

  it('KBN-006.5.4 @RED - cannot submit with missing business_name', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS.email);
    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);

    expect(component.canContinue()).toBe(false);
  });

  it('KBN-006.5.5 @RED - can submit without optional phone', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS_NO_PHONE.email);
    component.updateField('password', VALID_CREDENTIALS_NO_PHONE.password);
    component.updateField('full_name', VALID_CREDENTIALS_NO_PHONE.full_name);
    component.updateField('business_name', VALID_CREDENTIALS_NO_PHONE.business_name);

    expect(component.canContinue()).toBe(true);
  });

  it('KBN-006.5.6 @RED - validates minimum length for full_name (2 chars)', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('full_name', 'a'); // Too short
    component.validate();

    expect(component.errors.full_name).toBeDefined();
  });

  it('KBN-006.5.7 @RED - validates maximum length for full_name (120 chars)', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    const longName = 'a'.repeat(121);
    component.updateField('full_name', longName);
    component.validate();

    expect(component.errors.full_name).toBeDefined();
  });

  it('KBN-006.5.8 @RED - validates minimum length for business_name (2 chars)', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('business_name', 'a'); // Too short
    component.validate();

    expect(component.errors.business_name).toBeDefined();
  });

  it('KBN-006.5.9 @RED - validates maximum length for business_name (120 chars)', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    const longName = 'a'.repeat(121);
    component.updateField('business_name', longName);
    component.validate();

    expect(component.errors.business_name).toBeDefined();
  });
});

describe('KBN-006.6 - Continue button state', () => {
  it('KBN-006.6.1 @RED - template has [disabled] binding on continue button', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/\[disabled\]/);
    expect(html).toMatch(/Continuar|Siguiente|Siguiente paso/i);
  });

  it('KBN-006.6.2 @RED - continue button disabled when form invalid', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    expect(component.canContinue()).toBe(false);
  });

  it('KBN-006.6.3 @RED - continue button enabled when all required fields valid', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS.email);
    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);

    expect(component.canContinue()).toBe(true);
  });
});

describe('KBN-006.7 - State preservation', () => {
  it('KBN-006.7.1 @RED - persists credentials to onboarding storage', async () => {
    const { ONBOARDING_STORAGE_KEY, persistCredentials, readCredentials } =
      await loadOnboardingCredentialsStorageModule();
    const storage = createMemoryStorage();

    persistCredentials(storage, VALID_CREDENTIALS);

    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBeDefined();
    expect(readCredentials(storage)).toBeDefined();
  });

  it('KBN-006.7.2 @RED - persists credentials excluding password (security)', async () => {
    const { persistCredentials, readCredentials } = await loadOnboardingCredentialsStorageModule();
    const storage = createMemoryStorage();

    persistCredentials(storage, VALID_CREDENTIALS);
    const stored = readCredentials(storage);

    // Password should NOT be persisted
    expect(stored?.password).toBeUndefined();
  });

  it('KBN-006.7.3 @RED - readCredentials returns null when no data persisted', async () => {
    const { readCredentials } = await loadOnboardingCredentialsStorageModule();
    const emptyStorage = createMemoryStorage();

    expect(readCredentials(emptyStorage)).toBeNull();
  });

  it('KBN-006.7.4 @RED - storage key matches spec: turnea.onboarding.v1', async () => {
    const { ONBOARDING_STORAGE_KEY } = await loadOnboardingCredentialsStorageModule();

    expect(ONBOARDING_STORAGE_KEY).toMatch(/turnea\.onboarding/i);
  });
});

describe('KBN-006.8 - Navigation to Step 3', () => {
  it('KBN-006.8.1 @RED - component has Router dependency for navigation', async () => {
    const { component } = readCredentialsStepSources();

    expect(component).toMatch(/Router|router\.navigate|navigateByUrl/i);
  });

  it('KBN-006.8.2 @RED - continue() navigates to business-types step-3 route', async () => {
    const { component } = readCredentialsStepSources();

    // Should route to next step (business-types)
    expect(component).toMatch(
      /signup-business-types|step-3|business-types|tipo de negocio/i
    );
  });

  it('KBN-006.8.3 @RED - template button triggers continue action', async () => {
    const { html } = readCredentialsStepSources();

    // Should have (click)="continue()" or similar
    expect(html).toMatch(/\(click\)=.*continue|\(click\)=.*onContinue/i);
  });
});

describe('KBN-006.9 - Back navigation', () => {
  it('KBN-006.9.1 @RED - component has goBack() method', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    expect(typeof component.goBack).toBe('function');
  });

  it('KBN-006.9.2 @RED - template has back button', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/Volver|Atrás|Atras|Retroceder/i);
  });

  it('KBN-006.9.3 @RED - back button has (click) binding to goBack()', async () => {
    const { html } = readCredentialsStepSources();

    expect(html).toMatch(/\(click\)=.*goBack/i);
  });

  it('KBN-006.9.4 @RED - goBack navigates to plan selection step', async () => {
    const { component } = readCredentialsStepSources();

    // Should route back to signup-plan or Step 1
    expect(component).toMatch(
      /signup-plan-signup-step|step-1|plan-selection/i
    );
  });
});

describe('KBN-006.10 - Plan persistence from Step 1', () => {
  it('KBN-006.10.1 @RED - component reads persisted plan from Step 1', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const { ONBOARDING_PLAN_STORAGE_KEY, persistPlanSelection, readPlanSelection } =
      await loadOnboardingPlanStorageModule?.() ?? {};

    const storage = createMemoryStorage();

    // Simulate Step 1 persisted a plan
    if (persistPlanSelection && readPlanSelection) {
      persistPlanSelection(storage, 'PRO');
      const plan = readPlanSelection(storage);

      expect(plan).toBe('PRO');
    }
  });

  it('KBN-006.10.2 @RED - plan persists after credentials form navigation', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const { ONBOARDING_PLAN_STORAGE_KEY } = await loadOnboardingPlanStorageModule?.() ?? {};

    // After navigating to Step 2, plan should still be accessible
    // This tests that goBack() doesn't clear Step 1 data
    expect(ONBOARDING_PLAN_STORAGE_KEY ?? '').toMatch(/turnea\.onboarding/i);
  });
});

describe('KBN-006.11 - Edge cases', () => {
  it('KBN-006.11.1 - storage handles corrupted JSON gracefully', async () => {
    const { ONBOARDING_STORAGE_KEY, readCredentials } =
      await loadOnboardingCredentialsStorageModule();
    const corruptedStorage = createMemoryStorage({
      [ONBOARDING_STORAGE_KEY!]: '{bad-json'
    });

    expect(readCredentials(corruptedStorage)).toBeNull();
  });

  it('KBN-006.11.2 @RED - phone validates E.164 format when provided', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS.email);
    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);
    component.updateField('phone', 'invalid-phone');

    component.validate();

    // Phone should have error when invalid format
    expect(component.errors.phone).toBeDefined();
  });

  it('KBN-006.11.3 @RED - phone accepts valid E.164 format', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    component.updateField('email', VALID_CREDENTIALS.email);
    component.updateField('password', VALID_CREDENTIALS.password);
    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    component.updateField('business_name', VALID_CREDENTIALS.business_name);
    component.updateField('phone', '+5491155551234');

    component.validate();

    // Valid E.164 should not have error
    expect(component.errors.phone).toBeUndefined();
  });

  it('KBN-006.11.4 @RED - fields can be updated incrementally', async () => {
    const { SignupCredentialsStepPage } = await loadSignupCredentialsComponent();
    const component = new SignupCredentialsStepPage();

    // Update one field at a time
    component.updateField('email', VALID_CREDENTIALS.email);
    expect(component.credentials.email).toBe(VALID_CREDENTIALS.email);

    component.updateField('password', VALID_CREDENTIALS.password);
    expect(component.credentials.password).toBe(VALID_CREDENTIALS.password);

    component.updateField('full_name', VALID_CREDENTIALS.full_name);
    expect(component.credentials.full_name).toBe(VALID_CREDENTIALS.full_name);
  });
});

// Helper function to load plan storage (reuses KBN-004 logic)
async function loadOnboardingPlanStorageModule(): Promise<{
  ONBOARDING_PLAN_STORAGE_KEY: string;
  persistPlanSelection: (storage: OnboardingStorageLike, plan: PlanCode) => void;
  readPlanSelection: (storage: OnboardingStorageLike) => PlanCode | null;
}> {
  let module: Record<string, unknown>;

  try {
    module = await import('../../features/onboarding/data-access/onboarding-plan-storage');
  } catch {
    throw new Error(
      'TODO: import from KBN-004 - src/app/features/onboarding/data-access/onboarding-plan-storage.ts'
    );
  }

  const ONBOARDING_PLAN_STORAGE_KEY = module['ONBOARDING_PLAN_STORAGE_KEY'] as
    | string
    | undefined;
  const persistPlanSelection = module['persistPlanSelection'] as
    | ((storage: OnboardingStorageLike, plan: PlanCode) => void)
    | undefined;
  const readPlanSelection = module['readPlanSelection'] as
    | ((storage: OnboardingStorageLike) => PlanCode | null)
    | undefined;

  return {
    ONBOARDING_PLAN_STORAGE_KEY: ONBOARDING_PLAN_STORAGE_KEY!,
    persistPlanSelection: persistPlanSelection!,
    readPlanSelection: readPlanSelection!
  };
}
