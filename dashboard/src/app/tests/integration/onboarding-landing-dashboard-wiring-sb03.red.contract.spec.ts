import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type PlanCode = 'FREE' | 'STARTER' | 'GROWTH' | 'PRO' | 'BASIC' | 'MEDIUM';
type AccountState = 'enabled' | 'pending_payment';
type NextRoute = 'dashboard_home' | 'billing_subscription';
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
    route: 'billing_subscription';
    reason: 'payment_failure';
    attemptId: string;
  };
};

type EntitlementsSnapshot = {
  maxLocales: number;
  maxRubros: number;
  maxMonthlyBookings: number | null;
  aiCreditsMonthly: number;
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
      routeTo: '/dashboard/inicio' | '/billing/subscription';
      selectedPlan: PlanCode;
      entitlements: EntitlementsSnapshot;
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
      routeTo: '/dashboard/inicio' | '/billing/subscription';
      retry?: {
        allowed: boolean;
        reason: 'payment_failure';
        routeTo: '/billing/subscription';
        attemptId: string;
      };
      pendingMessage?: string;
    }>;
  };
};

async function loadOnboardingFlowWiringModule(): Promise<OnboardingFlowWiringModule> {
  try {
    const mod = await import('../../features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow');
    return mod as OnboardingFlowWiringModule;
  } catch {
    throw new Error(
      'TODO(Aurora/Magnus): add src/app/features/onboarding/data-access/landing-dashboard-onboarding-wiring.flow.ts exporting createLandingDashboardOnboardingFlowWiring({ onboardingPersistenceService, fakeMoneySubscriptionSimulator }) with submitLandingOnboarding(...) and simulateBillingOutcome(...).'
    );
  }
}

function readLandingDashboardWiringSource(): string {
  const sourcePath = path.join(
    process.cwd(),
    'src',
    'app',
    'features',
    'onboarding',
    'data-access',
    'landing-dashboard-onboarding-wiring.flow.ts'
  );
  expect(fs.existsSync(sourcePath), 'Missing landing-dashboard onboarding wiring source file').toBe(true);
  return fs.readFileSync(sourcePath, 'utf8');
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
  it('uses the core catalog as plan source of truth instead of legacy local plan unions or fallback entitlement literals', () => {
    const source = readLandingDashboardWiringSource();

    expect(source, 'Wiring must import/read the core reference catalog').toMatch(/core\/catalog\/reference-catalog|reference-catalog/);
    expect(source, 'Plan decisions must normalize through catalog-backed helpers or account policy').toMatch(
      /normalizePlanCode|resolvePlanCodeFromCatalog|resolveAccountPlanPolicy|getPlanEntitlementsFromCatalog/
    );

    expect(source, 'Remove legacy local PlanCode union as source of truth').not.toMatch(
      /type\s+PlanCode\s*=\s*['"]FREE['"]\s*\|\s*['"]BASIC['"]\s*\|\s*['"]MEDIUM['"]\s*\|\s*['"]PRO['"]/i
    );
    expect(source, 'Do not keep raw BASIC/MEDIUM-only premium branching; aliases must normalize to catalog plans').not.toMatch(
      /\bBASIC\b[\s\S]{0,80}\bMEDIUM\b|\bMEDIUM\b[\s\S]{0,80}\bBASIC\b/
    );
    expect(source, 'Do not keep local per-plan entitlement matrices in onboarding wiring').not.toMatch(
      /FREE[\s\S]{0,120}(BASIC|STARTER)[\s\S]{0,120}(MEDIUM|GROWTH)[\s\S]{0,120}PRO/
    );
    expect(source, 'Do not keep local entitlement fallback object literals when catalog helpers can resolve FREE').not.toMatch(
      /\?\?\s*\{\s*maxLocales:\s*\d+[\s\S]{0,160}aiCreditsMonthly:\s*\d+\s*\}/
    );
  });

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
      entitlements: { maxLocales: 1, maxRubros: 1, maxMonthlyBookings: 15, aiCreditsMonthly: 0 },
      routeTo: '/dashboard/inicio',
      selectedPlan: 'FREE'
    });
  });

  it('premium submit without payment completion routes to billing subscription with pending messaging', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-premium',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription',
          selectedPlan: 'PRO'
        })
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({
          accountId: 'acc-premium',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription'
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
      entitlements: { maxLocales: 1, maxRubros: 10, maxMonthlyBookings: null, aiCreditsMonthly: 2000 },
      routeTo: '/billing/subscription',
      selectedPlan: 'PRO',
      pendingMessage: 'Payment pending. Continue to subscription preapproval to activate your plan.'
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
          nextRoute: 'billing_subscription',
          retry: {
            allowed: true,
            route: 'billing_subscription',
            reason: 'payment_failure',
            attemptId: 'retry-001'
          }
        };
      }

      return {
        accountId: 'acc-001',
        accountState: 'pending_payment',
        nextRoute: 'billing_subscription'
      };
    });

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: async () => ({
          accountId: 'acc-001',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription',
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
      routeTo: '/billing/subscription',
      retry: {
        allowed: true,
        reason: 'payment_failure',
        routeTo: '/billing/subscription',
        attemptId: 'retry-001'
      },
      pendingMessage: expect.stringMatching(/pending|retry|payment/i)
    });

    expect(cancel).toEqual({
      accountId: 'acc-001',
      accountState: 'pending_payment',
      routeTo: '/billing/subscription',
      pendingMessage: expect.stringMatching(/pending|subscription|preapproval|payment/i)
    });
  });

  it('normalizes legacy BASIC/MEDIUM aliases to STARTER/GROWTH before persistence and entitlement decisions', async () => {
    const flowModule = await loadOnboardingFlowWiringModule();
    const persistSpy = vi.fn(
      async (input: { payload: { selectedPlan: PlanCode } }): Promise<PersistResult> => ({
        accountId: 'acc-consistency',
        accountState: 'pending_payment',
        nextRoute: 'billing_subscription',
        selectedPlan: input.payload.selectedPlan
      })
    );

    const wiring = flowModule.createLandingDashboardOnboardingFlowWiring({
      onboardingPersistenceService: {
        persistOnboardingSelection: persistSpy
      },
      fakeMoneySubscriptionSimulator: {
        simulate: async () => ({
          accountId: 'acc-consistency',
          accountState: 'pending_payment',
          nextRoute: 'billing_subscription'
        })
      }
    });

    const basicResult = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-consistency' },
      landingState: makeLandingState({
        selectedPlan: 'BASIC',
        salonNames: ['Central']
      }),
      activeStep: 'review',
      submitStateVersion: 1,
      activeStateVersion: 1
    });

    const mediumResult = await wiring.submitLandingOnboarding({
      tenantContext: { accountId: 'acc-consistency' },
      landingState: makeLandingState({
        selectedPlan: 'MEDIUM',
        salonNames: ['Central', 'Norte']
      }),
      activeStep: 'review',
      submitStateVersion: 2,
      activeStateVersion: 2
    });

    const [firstCall, secondCall] = persistSpy.mock.calls;
    expect(firstCall?.[0]?.payload).toBeDefined();
    expect(Object.keys(firstCall[0].payload).sort()).toEqual(['account', 'profile', 'salons', 'selectedPlan']);
    expect(firstCall[0].payload.selectedPlan).toBe('STARTER');
    expect(secondCall?.[0]?.payload.selectedPlan).toBe('GROWTH');
    expect(basicResult).toEqual({
      accountId: 'acc-consistency',
      accountState: 'pending_payment',
      entitlements: { maxLocales: 1, maxRubros: 2, maxMonthlyBookings: null, aiCreditsMonthly: 100 },
      routeTo: '/billing/subscription',
      selectedPlan: 'STARTER',
      pendingMessage: 'Payment pending. Continue to subscription preapproval to activate your plan.'
    });
    expect(mediumResult).toEqual({
      accountId: 'acc-consistency',
      accountState: 'pending_payment',
      entitlements: { maxLocales: 1, maxRubros: 5, maxMonthlyBookings: null, aiCreditsMonthly: 500 },
      routeTo: '/billing/subscription',
      selectedPlan: 'GROWTH',
      pendingMessage: 'Payment pending. Continue to subscription preapproval to activate your plan.'
    });
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
