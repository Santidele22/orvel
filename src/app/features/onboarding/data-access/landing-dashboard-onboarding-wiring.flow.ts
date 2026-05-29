import {
  readOnboardingResumeCheckpoint,
  type OnboardingResumeCheckpoint
} from './onboarding-storage';
import { getPlanEntitlements } from '../../../core/plans/plan-entitlements';

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

type WiringDependencies = {
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
};

const DASHBOARD_ENTRY_ROUTE = '/dashboard/inicio' as const;
const BILLING_CHECKOUT_ROUTE = '/billing/test-checkout' as const;
const LANDING_ONBOARDING_ROUTE = '/landing/onboarding' as const;
const PENDING_CHECKOUT_MESSAGE = 'Payment pending. Continue to checkout to activate your plan.';
const PENDING_RETRY_MESSAGE = 'Payment pending. Retry checkout to complete payment.';

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeOptionalText(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateProfileOrThrow(input: {
  ownerName: string;
  email: string;
}): void {
  if (!input.ownerName) {
    throw new Error('Validation error: ownerName is required.');
  }

  if (!isValidEmail(input.email)) {
    throw new Error('Validation error: email format is invalid.');
  }
}

function normalizeSalonNames(salonNames: string[]): Array<{ name: string }> {
  const deduplicated = new Set<string>();

  for (const salonName of salonNames) {
    const normalizedName = salonName.trim();
    if (!normalizedName) {
      continue;
    }

    deduplicated.add(normalizedName);
  }

  return Array.from(deduplicated).map((name) => ({ name }));
}

function resolveRoute(nextRoute: NextRoute): typeof DASHBOARD_ENTRY_ROUTE | typeof BILLING_CHECKOUT_ROUTE {
  return nextRoute === 'dashboard_home' ? DASHBOARD_ENTRY_ROUTE : BILLING_CHECKOUT_ROUTE;
}

function mapSubmitResult(result: PersistResult) {
  const routeTo = resolveRoute(result.nextRoute);
  const entitlements = getPlanEntitlements(result.selectedPlan);

  if (routeTo === BILLING_CHECKOUT_ROUTE) {
    return {
      accountId: result.accountId,
      accountState: result.accountState,
      routeTo,
      selectedPlan: result.selectedPlan,
      entitlements,
      pendingMessage: PENDING_CHECKOUT_MESSAGE
    };
  }

  return {
    accountId: result.accountId,
    accountState: result.accountState,
    routeTo,
    selectedPlan: result.selectedPlan,
    entitlements
  };
}

function createPersistenceFallbackState(input: {
  tenantContext: { accountId: string };
  selectedPlan: PlanCode;
  reason: unknown;
}) {
  const reasonText = input.reason instanceof Error ? input.reason.message : 'persistence_error';

  return {
    accountId: input.tenantContext.accountId,
    accountState: 'pending_payment' as const,
    routeTo: LANDING_ONBOARDING_ROUTE,
    selectedPlan: input.selectedPlan,
    entitlements: getPlanEntitlements(input.selectedPlan),
    retryable: true,
    fallbackReason: `onboarding_persistence_timeout:${reasonText}`
  };
}

export function resumeOnboardingFromStorage(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): {
  checkpoint: OnboardingResumeCheckpoint;
  rehydratedAt: string;
  source: 'storage_resume';
} {
  return {
    checkpoint: readOnboardingResumeCheckpoint(storage),
    rehydratedAt: new Date().toISOString(),
    source: 'storage_resume'
  };
}

function mapSimulationResult(result: SimulationResult) {
  const routeTo = resolveRoute(result.nextRoute);
  const base = {
    accountId: result.accountId,
    accountState: result.accountState,
    routeTo
  };

  if (result.retry) {
    return {
      ...base,
      retry: {
        allowed: result.retry.allowed,
        reason: result.retry.reason,
        routeTo: BILLING_CHECKOUT_ROUTE,
        attemptId: result.retry.attemptId
      },
      pendingMessage: PENDING_RETRY_MESSAGE
    };
  }

  if (routeTo === BILLING_CHECKOUT_ROUTE) {
    return {
      ...base,
      pendingMessage: PENDING_CHECKOUT_MESSAGE
    };
  }

  return base;
}

export function createLandingDashboardOnboardingFlowWiring(deps: WiringDependencies) {
  return {
    async submitLandingOnboarding(input: {
      tenantContext: { accountId: string };
      landingState: LandingNormalizedState;
      activeStep: 'review';
      submitStateVersion: number;
      activeStateVersion: number;
    }): Promise<{
      accountId: string;
      accountState: AccountState;
      routeTo: typeof DASHBOARD_ENTRY_ROUTE | typeof BILLING_CHECKOUT_ROUTE | typeof LANDING_ONBOARDING_ROUTE;
      selectedPlan: PlanCode;
      entitlements: { maxLocales: number; maxRubros: number };
      pendingMessage?: string;
      retryable?: boolean;
      fallbackReason?: string;
    }> {
      if (input.submitStateVersion !== input.activeStateVersion) {
        throw new Error('Stale submit state version.');
      }

      const normalizedOwnerName = normalizeText(input.landingState.ownerName);
      const normalizedEmail = normalizeText(input.landingState.email);

      validateProfileOrThrow({
        ownerName: normalizedOwnerName,
        email: normalizedEmail
      });

      try {
        const persistResult = await deps.onboardingPersistenceService.persistOnboardingSelection({
          tenantContext: input.tenantContext,
          payload: {
            profile: {
              ownerName: normalizedOwnerName,
              email: normalizedEmail,
              phone: normalizeOptionalText(input.landingState.phone)
            },
            account: {
              businessName: normalizeText(input.landingState.businessName)
            },
            salons: normalizeSalonNames(input.landingState.salonNames),
            selectedPlan: input.landingState.selectedPlan
          }
        });

        return mapSubmitResult(persistResult);
      } catch (error) {
        return createPersistenceFallbackState({
          tenantContext: input.tenantContext,
          selectedPlan: input.landingState.selectedPlan,
          reason: error
        });
      }
    },

    async simulateBillingOutcome(input: {
      tenantContext: { accountId: string };
      accountId: string;
      selectedPlan: PlanCode;
      outcome: SimulationOutcome;
      testMode: true;
    }): Promise<{
      accountId: string;
      accountState: AccountState;
      routeTo: typeof DASHBOARD_ENTRY_ROUTE | typeof BILLING_CHECKOUT_ROUTE;
      retry?: {
        allowed: boolean;
        reason: 'payment_failure';
        routeTo: typeof BILLING_CHECKOUT_ROUTE;
        attemptId: string;
      };
      pendingMessage?: string;
    }> {
      const simulationResult = await deps.fakeMoneySubscriptionSimulator.simulate({
        tenantContext: input.tenantContext,
        accountId: input.accountId,
        selectedPlan: input.selectedPlan,
        outcome: input.outcome,
        testMode: input.testMode
      });

      return mapSimulationResult(simulationResult);
    }
  };
}
