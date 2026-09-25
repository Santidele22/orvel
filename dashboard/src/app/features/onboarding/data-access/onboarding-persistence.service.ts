import { resolveAccountPlanPolicy } from '../../../core/accounts/account-plan-policy';
import { normalizePlanCode, type CanonicalPlanCode } from '../../../core/plans/plan-entitlements';

type AccountState = 'enabled' | 'pending_payment';
type NextRouteDecision = 'dashboard_home' | 'billing_subscription';

type OnboardingPayload = {
  profile: {
    ownerName: string;
    email: string;
    phone?: string;
  };
  account: {
    businessName: string;
  };
  salons: Array<{ name: string }>;
  selectedPlan: unknown;
};

type PersistOnboardingResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: NextRouteDecision;
  selectedPlan: CanonicalPlanCode;
};

type OnboardingPersistenceDependencies = {
  accountRepository: {
    upsertForTenant: (input: {
      tenantAccountId: string;
      profile: OnboardingPayload['profile'];
      account: OnboardingPayload['account'];
      selectedPlan: CanonicalPlanCode;
      accountState: AccountState;
    }) => Promise<{ accountId: string; tenantAccountId: string }>;
  };
  salonRepository: {
    replaceForAccount: (input: {
      tenantAccountId: string;
      accountId: string;
      salons: Array<{ name: string }>;
    }) => Promise<void>;
  };
};

function resolveTransition(plan: CanonicalPlanCode): { accountState: AccountState; nextRoute: NextRouteDecision } {
  const policy = resolveAccountPlanPolicy({ plan, premiumPaid: false });

  if (policy.accountEnabled) {
    return {
      accountState: 'enabled',
      nextRoute: 'dashboard_home'
    };
  }

  return {
    accountState: 'pending_payment',
    nextRoute: 'billing_subscription'
  };
}

function ensureTenantAccountId(tenantContext: { accountId: string }): string {
  const tenantAccountId = tenantContext?.accountId?.trim();

  if (!tenantAccountId) {
    throw new Error('Tenant account context is required.');
  }

  return tenantAccountId;
}

function sanitizeSalonsForState(input: { salons: Array<{ name: string }>; accountState: AccountState }): Array<{ name: string }> {
  const normalizedSalons = input.salons.filter((salon) => typeof salon?.name === 'string' && salon.name.trim().length > 0);

  if (input.accountState === 'enabled') {
    return normalizedSalons.slice(0, 1);
  }

  return normalizedSalons.slice(0, 1);
}

export function createOnboardingPersistenceService(deps: OnboardingPersistenceDependencies) {
  return {
    async persistOnboardingSelection(input: {
      tenantContext: { accountId: string };
      payload: OnboardingPayload;
    }): Promise<PersistOnboardingResult> {
      const tenantAccountId = ensureTenantAccountId(input.tenantContext);
      const payload = input.payload;
      const selectedPlan = normalizePlanCode(payload.selectedPlan);
      const transition = resolveTransition(selectedPlan);

      await deps.accountRepository.upsertForTenant({
        tenantAccountId,
        profile: {
          ownerName: payload.profile.ownerName,
          email: payload.profile.email,
          phone: payload.profile.phone
        },
        account: {
          businessName: payload.account.businessName
        },
        selectedPlan,
        accountState: transition.accountState
      });

      await deps.salonRepository.replaceForAccount({
        tenantAccountId,
        accountId: tenantAccountId,
        salons: sanitizeSalonsForState({
          salons: payload.salons,
          accountState: transition.accountState
        })
      });

      return {
        accountId: tenantAccountId,
        accountState: transition.accountState,
        nextRoute: transition.nextRoute,
        selectedPlan
      };
    }
  };
}
