/**
 * KB-012: Onboarding Flow Completion - TDD guard tests (RED)
 *
 * Scope:
 * 1) Onboarding steps progression and persistence
 * 2) Business profile data validation/persistence
 * 3) Plan selection and entitlement bootstrap
 * 4) Landing->dashboard wiring after onboarding completion
 * 5) Resume onboarding state after refresh
 * 6) Error handling and fallback states
 */

import { describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type LandingState = {
  ownerName: string;
  email: string;
  phone?: string;
  businessName: string;
  salonNames: string[];
  selectedPlan: PlanCode;
};

type PersistResult = {
  accountId: string;
  accountState: 'enabled' | 'pending_payment';
  nextRoute: 'dashboard_home' | 'billing_subscription';
  selectedPlan: PlanCode;
};

type OnboardingWiringModule = {
  createLandingDashboardOnboardingFlowWiring: (deps: {
    onboardingPersistenceService: {
      persistOnboardingSelection: (input: {
        tenantContext: { accountId: string };
        payload: {
          profile: { ownerName: string; email: string; phone?: string };
          account: { businessName: string };
          salons: Array<{ name: string }>;
          selectedPlan: PlanCode;
        };
      }) => Promise<PersistResult>;
    };
    fakeMoneySubscriptionSimulator: {
      simulate: (input: {
        tenantContext: { accountId: string };
        accountId: string;
        selectedPlan: PlanCode;
        outcome: 'success' | 'failure' | 'cancel';
        testMode: boolean;
      }) => Promise<unknown>;
    };
  }) => {
    submitLandingOnboarding: (input: {
      tenantContext: { accountId: string };
      landingState: LandingState;
      activeStep: 'review';
      submitStateVersion: number;
      activeStateVersion: number;
    }) => Promise<{
      accountId: string;
      accountState: 'enabled' | 'pending_payment';
      routeTo: '/dashboard/inicio' | '/billing/subscription';
      selectedPlan: PlanCode;
      pendingMessage?: string;
    }>;
  };
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

type OnboardingStorageModule = {
  ONBOARDING_STORAGE_KEY: string;
  persistOnboardingState: (storage: StorageLike, state: {
    selectedRubros: string[];
    selectedTemplateIds: string[];
    preloadedCatalog: {
      categories: Array<{ slug?: string; name: string }>;
      services: Array<{ slug?: string; name: string; categorySlug?: string; baseDurationMinutes: number }>;
    };
  }) => void;
  readOnboardingState: (storage: StorageLike) => {
    selectedRubros: string[];
    selectedTemplateIds: string[];
    preloadedCatalog: {
      categories: Array<{ slug?: string; name: string }>;
      services: Array<{ slug?: string; name: string; categorySlug?: string; baseDurationMinutes: number }>;
    };
  };
};

type PlanEntitlementsModule = {
  getPlanEntitlements: (plan: unknown) => {
    maxLocales: number;
    maxRubros: number;
  };
};

async function loadWiringModule(): Promise<OnboardingWiringModule> {
  const mod = await import('../../features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow');
  return mod as OnboardingWiringModule;
}

async function loadStorageModule(): Promise<OnboardingStorageModule> {
  const mod = await import('../../features/onboarding/data-access/onboarding-storage');
  return mod as OnboardingStorageModule;
}

async function loadPlanEntitlementsModule(): Promise<PlanEntitlementsModule> {
  const mod = await import('../../core/plans/plan-entitlements');
  return mod as PlanEntitlementsModule;
}

function makeLandingState(overrides: Partial<LandingState> = {}): LandingState {
  return {
    ownerName: 'Santi Perez',
    email: 'santi@turnea.app',
    phone: '+54 11 5555 0101',
    businessName: 'Salon Luna',
    salonNames: ['Casa Central'],
    selectedPlan: 'FREE',
    ...overrides
  };
}

function createMemoryStorage(seed?: Record<string, string>): StorageLike {
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

function readOnboardingSources(): { storage: string; wiring: string; landingPage: string; merged: string } {
  const storagePath = resolve(process.cwd(), 'src/app/features/onboarding/data-access/onboarding-storage.ts');
  const wiringPath = resolve(process.cwd(), 'src/app/features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts');
  const landingPath = resolve(process.cwd(), 'src/app/features/onboarding/pages/onboarding-business-step.page.ts');

  const storage = existsSync(storagePath) ? readFileSync(storagePath, 'utf-8') : '';
  const wiring = existsSync(wiringPath) ? readFileSync(wiringPath, 'utf-8') : '';
  const landingPage = existsSync(landingPath) ? readFileSync(landingPath, 'utf-8') : '';

  return {
    storage,
    wiring,
    landingPage,
    merged: `${storage}\n${wiring}\n${landingPage}`
  };
}

describe('KB-012.1 - Onboarding step progression + persistence', () => {
  it('KB-012.1.1 - persists onboarding selected rubros/templates/catalog baseline', async () => {
    const { ONBOARDING_STORAGE_KEY, persistOnboardingState, readOnboardingState } = await loadStorageModule();
    const storage = createMemoryStorage();

    const state = {
      selectedRubros: ['peluqueria', 'unas'],
      selectedTemplateIds: ['tpl-peluqueria-base', 'tpl-unas-base'],
      preloadedCatalog: {
        categories: [{ slug: 'cortes', name: 'Cortes' }],
        services: [{ slug: 'corte', name: 'Corte', categorySlug: 'cortes', baseDurationMinutes: 45 }]
      }
    };

    persistOnboardingState(storage, state);

    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBeTypeOf('string');
    expect(readOnboardingState(storage)).toEqual(state);
  });

  it('KB-012.1.2 @RED - step progression metadata is persisted (activeStep + stateVersion + completedAt)', () => {
    const { storage, wiring, landingPage } = readOnboardingSources();
    expect(`${storage}\n${wiring}\n${landingPage}`).toMatch(/activeStep|currentStep|stepIndex/i);
    expect(`${storage}\n${wiring}`).toMatch(/stateVersion|version/i);
    expect(`${storage}\n${wiring}`).toMatch(/completedAt|finishedAt|onboardingCompleted/i);
  });
});

describe('KB-012.2 - Business profile validation + persistence', () => {
  it('KB-012.2.1 - normalizes profile/account payload before persistence', async () => {
    const wiringModule = await loadWiringModule();
    const persistSpy = vi.fn(async (): Promise<PersistResult> => ({
      accountId: 'acc-kb012',
      accountState: 'enabled',
      nextRoute: 'dashboard_home',
      selectedPlan: 'FREE'
    }));

    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: persistSpy
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-kb012' },
      landingState: makeLandingState({
        ownerName: '  Santi Perez  ',
        email: '  santi@turnea.app  ',
        businessName: '  Salon Luna  ',
        salonNames: [' Casa Central ', 'Casa Central', '']
      }),
      activeStep: 'review',
      submitStateVersion: 7,
      activeStateVersion: 7
    });

    expect(persistSpy).toHaveBeenCalledWith({
      tenantContext: { accountId: 'acc-kb012' },
      payload: {
        profile: {
          ownerName: 'Santi Perez',
          email: 'santi@turnea.app',
          phone: '+54 11 5555 0101'
        },
        account: {
          businessName: 'Salon Luna'
        },
        salons: [{ name: 'Casa Central' }],
        selectedPlan: 'FREE'
      }
    });
  });

  it('KB-012.2.2 @RED - rejects invalid profile payload (missing owner/email malformed) before persistence write', async () => {
    const wiringModule = await loadWiringModule();
    const persistSpy = vi.fn(async (): Promise<PersistResult> => ({
      accountId: 'acc-invalid',
      accountState: 'enabled',
      nextRoute: 'dashboard_home',
      selectedPlan: 'FREE'
    }));

    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: persistSpy
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    await expect(
      wiring.submitLandingOnboarding({
        tenantContext: { accountId: 'acc-invalid' },
        landingState: makeLandingState({
          ownerName: '   ',
          email: 'not-an-email',
          businessName: 'Salon',
          salonNames: ['Central']
        }),
        activeStep: 'review',
        submitStateVersion: 1,
        activeStateVersion: 1
      })
    ).rejects.toThrow(/validation|owner|email/i);

    expect(persistSpy).not.toHaveBeenCalled();
  });
});

describe('KB-012.3 - Plan selection + entitlement bootstrap', () => {
  it('KB-012.3.1 - selected plan is persisted and returned in onboarding completion result', async () => {
    const wiringModule = await loadWiringModule();
    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-pro',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription',
          selectedPlan: 'PRO'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    const result = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-pro' },
      landingState: makeLandingState({ selectedPlan: 'PRO' }),
      activeStep: 'review',
      submitStateVersion: 4,
      activeStateVersion: 4
    });

    expect(result.selectedPlan).toBe('PRO');
  });

  it('KB-012.3.2 @RED - completion payload bootstraps entitlement snapshot for selected plan', async () => {
    const wiringModule = await loadWiringModule();
    const { getPlanEntitlements } = await loadPlanEntitlementsModule();
    const expected = getPlanEntitlements('PRO');

    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-ent-pro',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription',
          selectedPlan: 'PRO'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    const result = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-ent-pro' },
      landingState: makeLandingState({ selectedPlan: 'PRO' }),
      activeStep: 'review',
      submitStateVersion: 5,
      activeStateVersion: 5
    });

    const completion = result as unknown as { entitlements?: { maxLocales: number; maxRubros: number } };
    expect(completion.entitlements).toEqual(expected);
  });
});

describe('KB-012.4 - Landing -> dashboard wiring after completion', () => {
  it('KB-012.4.1 - FREE completion routes user to dashboard home', async () => {
    const wiringModule = await loadWiringModule();
    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-free',
          accountState: 'enabled',
          nextRoute: 'dashboard_home',
          selectedPlan: 'FREE'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    const result = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-free' },
      landingState: makeLandingState({ selectedPlan: 'FREE' }),
      activeStep: 'review',
      submitStateVersion: 2,
      activeStateVersion: 2
    });

    expect(result.routeTo).toBe('/dashboard/inicio');
    expect(result.accountState).toBe('enabled');
  });

  it('KB-012.4.2 - paid plan completion routes to billing subscription while pending payment', async () => {
    const wiringModule = await loadWiringModule();
    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-basic',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription',
          selectedPlan: 'BASIC'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    const result = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-basic' },
      landingState: makeLandingState({ selectedPlan: 'BASIC' }),
      activeStep: 'review',
      submitStateVersion: 3,
      activeStateVersion: 3
    });

    expect(result.routeTo).toBe('/billing/subscription');
    expect(result.pendingMessage).toMatch(/pending|payment|subscription|suscripci[oó]n/i);
  });
});

describe('KB-012.5 - Resume onboarding state after refresh', () => {
  it('KB-012.5.1 - rehydrates persisted onboarding state after refresh handoff', async () => {
    const { ONBOARDING_STORAGE_KEY, persistOnboardingState, readOnboardingState } = await loadStorageModule();
    const landingStorage = createMemoryStorage();

    const state = {
      selectedRubros: ['spa'],
      selectedTemplateIds: ['tpl-spa-base'],
      preloadedCatalog: {
        categories: [{ slug: 'relax', name: 'Relax' }],
        services: [{ slug: 'masaje', name: 'Masaje', categorySlug: 'relax', baseDurationMinutes: 60 }]
      }
    };

    persistOnboardingState(landingStorage, state);
    const raw = landingStorage.getItem(ONBOARDING_STORAGE_KEY);
    const refreshedStorage = createMemoryStorage(raw ? { [ONBOARDING_STORAGE_KEY]: raw } : undefined);

    expect(readOnboardingState(refreshedStorage)).toEqual(state);
  });

  it('KB-012.5.2 @RED - source wires onboarding resume checkpoint from storage into step flow', () => {
    const { merged } = readOnboardingSources();
    expect(merged).toMatch(/readOnboardingState/);
    expect(merged).toMatch(/resume|rehydrate|restore/i);
    expect(merged).toMatch(/activeStep|stepIndex|currentStep/i);
  });
});

describe('KB-012.6 - Error handling + fallback states', () => {
  it('KB-012.6.1 - reading corrupted onboarding payload falls back to safe empty defaults', async () => {
    const { ONBOARDING_STORAGE_KEY, readOnboardingState } = await loadStorageModule();
    const brokenStorage = createMemoryStorage({ [ONBOARDING_STORAGE_KEY]: '{bad-json' });

    expect(readOnboardingState(brokenStorage)).toEqual({
      selectedRubros: [],
      selectedTemplateIds: [],
      preloadedCatalog: { categories: [], services: [] }
    });
  });

  it('KB-012.6.2 @RED - submit handles persistence failure with deterministic fallback state (no uncaught throw)', async () => {
    const wiringModule = await loadWiringModule();
    const wiring = wiringModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => {
          throw new Error('Supabase timeout');
        }
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({})
      }
    });

    const outcome = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-fallback' },
      landingState: makeLandingState(),
      activeStep: 'review',
      submitStateVersion: 10,
      activeStateVersion: 10
    }) as unknown as {
      routeTo: '/landing/onboarding' | '/dashboard/inicio' | '/billing/subscription';
      fallbackReason?: string;
      retryable?: boolean;
    };

    expect(outcome.routeTo).toBe('/landing/onboarding');
    expect(outcome.retryable).toBe(true);
    expect(outcome.fallbackReason).toMatch(/timeout|supabase|persistence/i);
  });
});
