type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
type AccountState = 'enabled' | 'pending_payment';
type NextRouteDecision = 'dashboard_home' | 'billing_checkout';

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
  selectedPlan: PlanCode;
};

type PersistOnboardingResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: NextRouteDecision;
  selectedPlan: PlanCode;
};

type OnboardingPersistenceDependencies = {
  accountRepository: {
    upsertForTenant: (input: {
      tenantAccountId: string;
      profile: OnboardingPayload['profile'];
      account: OnboardingPayload['account'];
      selectedPlan: PlanCode;
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

function resolveTransition(plan: PlanCode): { accountState: AccountState; nextRoute: NextRouteDecision } {
  if (plan === 'FREE') {
    return {
      accountState: 'enabled',
      nextRoute: 'dashboard_home'
    };
  }

  return {
    accountState: 'pending_payment',
    nextRoute: 'billing_checkout'
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
      const transition = resolveTransition(payload.selectedPlan);

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
        selectedPlan: payload.selectedPlan,
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
        selectedPlan: payload.selectedPlan
      };
    }
  };
}
