import { describe, expect, it, vi } from 'vitest';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
type AccountState = 'enabled' | 'pending_payment';
type NextRoute = 'dashboard_home' | 'billing_checkout';
type SimulationOutcome = 'success' | 'failure' | 'cancel';

type LandingNormalizedState = {
  ownerName: string;
  email: string;
  phone?: string;
  businessName: string;
  salonNames: string[];
  selectedPlan: PlanCode;
};

type PersistResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: NextRoute;
  selectedPlan: PlanCode;
};

type SimulationResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: NextRoute;
  retry?: {
    allowed: boolean;
    route: 'billing_checkout';
    reason: 'payment_failure';
    attemptId: string;
  };
};

type OnboardingFlowWiringModule = {
  createLandingDashboardOnboardingFlowWiring: (deps: {
    onboardingPersistenceService: {
      persistOnboardingSelection: (input: {
        tenantContext: { accountId: string };
        payload: {
          profile: {
            ownerName: string;
            email: string;
            phone?: string;
          };
          account: {
            businessName: string;
          };
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
        outcome: SimulationOutcome;
        testMode: boolean;
      }) => Promise<SimulationResult>;
    };
  }) => {
    submitLandingOnboarding: (input: {
      tenantContext: { accountId: string };
      landingState: LandingNormalizedState;
      activeStep: 'review';
      submitStateVersion: number;
      activeStateVersion: number;
    }) => Promise<{
      accountId: string;
      accountState: AccountState;
      routeTo: '/dashboard/inicio' | '/billing/test-checkout';
      selectedPlan: PlanCode;
      pendingMessage?: string;
    }>;
    simulateBillingOutcome: (input: {
      tenantContext: { accountId: string };
      accountId: string;
      selectedPlan: PlanCode;
      outcome: SimulationOutcome;
      testMode: true;
    }) => Promise<{
      accountId: string;
      accountState: AccountState;
      routeTo: '/dashboard/inicio' | '/billing/test-checkout';
      retry?: {
        allowed: boolean;
        reason: 'payment_failure';
        routeTo: '/billing/test-checkout';
        attemptId: string;
      };
      pendingMessage?: string;
    }>;
  };
};

async function loadOnboardingFlowWiringModule(): Promise<OnboardingFlowWiringModule> {
  try {
    const mod = await import('../../core/onboarding/landing-dashboard-onboarding-wiring.flow');
    return mod as OnboardingFlowWiringModule;
  } catch {
    throw new Error(
      'TODO(Aurora/Magnus): add src/app/core/onboarding/landing-dashboard-onboarding-wiring.flow.ts exporting createLandingDashboardOnboardingFlowWiring({ onboardingPersistenceService, fakeMoneySubscriptionSimulator }) with submitLandingOnboarding(...) and simulateBillingOutcome(...).'
    );
  }
}

function makeLandingState(overrides: Partial<LandingNormalizedState> = {}): LandingNormalizedState {
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

describe('L-02/SB-03 RED/GREEN integration contract: landing -> persistence -> dashboard wiring', () => {
  it('on valid FREE landing submit, calls persistence with normalized payload + tenant context and routes to dashboard entry', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();
    const persistSpy = vi.fn(async (): Promise<PersistResult> => ({
      accountId: 'acc-001',
      accountState: 'enabled',
      nextRoute: 'dashboard_home',
      selectedPlan: 'FREE'
    }));

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: persistSpy
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({
          accountId: 'acc-001',
          accountState: 'enabled',
          nextRoute: 'dashboard_home'
        })
      }
    });

    const result = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-001' },
      landingState: makeLandingState({
        ownerName: '  Santi Perez  ',
        email: '  santi@turnea.app  ',
        businessName: '  Salon Luna  ',
        salonNames: [' Casa Central ', 'Casa Central', '']
      }),
      activeStep: 'review',
      submitStateVersion: 4,
      activeStateVersion: 4
    });

    expect(persistSpy).toHaveBeenCalledWith({
      tenantContext: { accountId: 'acc-001' },
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

    expect(result).toEqual({
      accountId: 'acc-001',
      accountState: 'enabled',
      routeTo: '/dashboard/inicio',
      selectedPlan: 'FREE'
    });
  });

  it('premium submit without payment completion routes to billing test-checkout with pending messaging', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-premium',
          accountState: 'pending_payment',
          nextRoute: 'billing_checkout',
          selectedPlan: 'PRO'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({
          accountId: 'acc-premium',
          accountState: 'pending_payment',
          nextRoute: 'billing_checkout'
        })
      }
    });

    const result = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-premium' },
      landingState: makeLandingState({
        selectedPlan: 'PRO',
        salonNames: ['Central', 'Sucursal Norte']
      }),
      activeStep: 'review',
      submitStateVersion: 8,
      activeStateVersion: 8
    });

    expect(result).toEqual({
      accountId: 'acc-premium',
      accountState: 'pending_payment',
      routeTo: '/billing/test-checkout',
      selectedPlan: 'PRO',
      pendingMessage: expect.stringMatching(/pending|payment|checkout/i)
    });
  });

  it('simulated success enables account and routes to dashboard, while failure/cancel stay pending and expose retry state', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();
    const simulateSpy = vi.fn(async (input: { outcome: SimulationOutcome }): Promise<SimulationResult> => {
      if (input.outcome === 'success') {
        return {
          accountId: 'acc-001',
          accountState: 'enabled',
          nextRoute: 'dashboard_home'
        };
      }

      if (input.outcome === 'failure') {
        return {
          accountId: 'acc-001',
          accountState: 'pending_payment',
          nextRoute: 'billing_checkout',
          retry: {
            allowed: true,
            route: 'billing_checkout',
            reason: 'payment_failure',
            attemptId: 'retry-001'
          }
        };
      }

      return {
        accountId: 'acc-001',
        accountState: 'pending_payment',
        nextRoute: 'billing_checkout'
      };
    });

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-001',
          accountState: 'pending_payment',
          nextRoute: 'billing_checkout',
          selectedPlan: 'PRO'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: simulateSpy
      }
    });

    const success = await wiring.simulateBillingOutcome({
      tenantContext: { accountId: 'acc-001' },
      accountId: 'acc-001',
      selectedPlan: 'PRO',
      outcome: 'success',
      testMode: true
    });

    const failure = await wiring.simulateBillingOutcome({
      tenantContext: { accountId: 'acc-001' },
      accountId: 'acc-001',
      selectedPlan: 'PRO',
      outcome: 'failure',
      testMode: true
    });

    const cancel = await wiring.simulateBillingOutcome({
      tenantContext: { accountId: 'acc-001' },
      accountId: 'acc-001',
      selectedPlan: 'PRO',
      outcome: 'cancel',
      testMode: true
    });

    expect(simulateSpy).toHaveBeenCalledTimes(3);
    expect(success).toEqual({
      accountId: 'acc-001',
      accountState: 'enabled',
      routeTo: '/dashboard/inicio'
    });

    expect(failure).toEqual({
      accountId: 'acc-001',
      accountState: 'pending_payment',
      routeTo: '/billing/test-checkout',
      retry: {
        allowed: true,
        reason: 'payment_failure',
        routeTo: '/billing/test-checkout',
        attemptId: 'retry-001'
      },
      pendingMessage: expect.stringMatching(/pending|retry|payment/i)
    });

    expect(cancel).toEqual({
      accountId: 'acc-001',
      accountState: 'pending_payment',
      routeTo: '/billing/test-checkout',
      pendingMessage: expect.stringMatching(/pending|checkout|payment/i)
    });
  });

  it('keeps selected plan + payload keys consistent from landing state into persistence contract', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();
    const persistSpy = vi.fn(async (): Promise<PersistResult> => ({
      accountId: 'acc-consistency',
      accountState: 'pending_payment',
      nextRoute: 'billing_checkout',
      selectedPlan: 'MEDIUM'
    }));

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: persistSpy
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({
          accountId: 'acc-consistency',
          accountState: 'pending_payment',
          nextRoute: 'billing_checkout'
        })
      }
    });

    await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-consistency' },
      landingState: makeLandingState({
        selectedPlan: 'MEDIUM',
        salonNames: ['Central', 'Norte']
      }),
      activeStep: 'review',
      submitStateVersion: 2,
      activeStateVersion: 2
    });

    const [firstCall] = persistSpy.mock.calls;
    expect(firstCall?.[0]?.payload).toBeDefined();
    expect(Object.keys(firstCall[0].payload).sort()).toEqual(['account', 'profile', 'salons', 'selectedPlan']);
    expect(firstCall[0].payload.selectedPlan).toBe('MEDIUM');
  });

  it('rejects submit when step state version is stale to prevent transition races', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();
    const persistSpy = vi.fn(async (): Promise<PersistResult> => ({
      accountId: 'acc-race',
      accountState: 'enabled',
      nextRoute: 'dashboard_home',
      selectedPlan: 'FREE'
    }));

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: persistSpy
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({
          accountId: 'acc-race',
          accountState: 'enabled',
          nextRoute: 'dashboard_home'
        })
      }
    });

    await expect(
      wiring.submitLandingOnboarding({
        tenantContext: { accountId: 'acc-race' },
        landingState: makeLandingState(),
        activeStep: 'review',
        submitStateVersion: 3,
        activeStateVersion: 4
      })
    ).rejects.toThrow(/stale|version|state|submit/i);

    expect(persistSpy).not.toHaveBeenCalled();
  });
});
