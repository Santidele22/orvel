import { describe, expect, it, vi } from 'vitest';

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

type OnboardingPersistenceModule = {
  createOnboardingPersistenceService: (deps: {
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
  }) => {
    persistOnboardingSelection: (input: {
      tenantContext: { accountId: string };
      payload: OnboardingPayload;
    }) => Promise<PersistOnboardingResult>;
  };
};

async function loadOnboardingPersistenceModule(): Promise<OnboardingPersistenceModule> {
  try {
    const mod = await import('../../core/onboarding/onboarding-persistence.service');
    return mod as OnboardingPersistenceModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/onboarding/onboarding-persistence.service.ts exporting createOnboardingPersistenceService({ accountRepository, salonRepository }) and persistOnboardingSelection({ tenantContext, payload }).'
    );
  }
}

describe('L-02 RED contract: onboarding persistence + deterministic account transition', () => {
  it('maps onboarding payload into account/profile/salon writes and enables FREE immediately', async () => {
    const onboardingPersistence = await loadOnboardingPersistenceModule();
    const accountUpsertSpy = vi.fn(async () => ({ accountId: 'acc-001', tenantAccountId: 'acc-001' }));
    const salonReplaceSpy = vi.fn(async () => undefined);

    const service = onboardingPersistence.createOnboardingPersistenceService({
      accountRepository: {
        upsertForTenant: accountUpsertSpy
      },
      salonRepository: {
        replaceForAccount: salonReplaceSpy
      }
    });

    const payload: OnboardingPayload = {
      profile: {
        ownerName: 'Santi Pérez',
        email: 'santi@turnea.app',
        phone: '+54 11 5555 0101'
      },
      account: {
        businessName: 'Salón Luna'
      },
      salons: [{ name: 'Casa Central' }, { name: 'Sucursal Norte' }],
      selectedPlan: 'FREE'
    };

    const result = await service.persistOnboardingSelection({
      tenantContext: { accountId: 'acc-001' },
      payload
    });

    expect(accountUpsertSpy).toHaveBeenCalledTimes(1);
    expect(accountUpsertSpy).toHaveBeenCalledWith({
      tenantAccountId: 'acc-001',
      profile: payload.profile,
      account: payload.account,
      selectedPlan: 'FREE',
      accountState: 'enabled'
    });

    expect(salonReplaceSpy).toHaveBeenCalledTimes(1);
    expect(salonReplaceSpy).toHaveBeenCalledWith({
      tenantAccountId: 'acc-001',
      accountId: 'acc-001',
      salons: [{ name: 'Casa Central' }]
    });

    expect(result).toEqual({
      accountId: 'acc-001',
      accountState: 'enabled',
      nextRoute: 'dashboard_home',
      selectedPlan: 'FREE'
    });
  });

  it('marks premium onboarding as pending_payment until payment is confirmed and routes to checkout', async () => {
    const onboardingPersistence = await loadOnboardingPersistenceModule();
    const accountUpsertSpy = vi.fn(async () => ({ accountId: 'acc-premium', tenantAccountId: 'acc-premium' }));
    const salonReplaceSpy = vi.fn(async () => undefined);

    const service = onboardingPersistence.createOnboardingPersistenceService({
      accountRepository: {
        upsertForTenant: accountUpsertSpy
      },
      salonRepository: {
        replaceForAccount: salonReplaceSpy
      }
    });

    const result = await service.persistOnboardingSelection({
      tenantContext: { accountId: 'acc-premium' },
      payload: {
        profile: {
          ownerName: 'Premium Owner',
          email: 'premium@turnea.app'
        },
        account: {
          businessName: 'Premium Beauty'
        },
        salons: [{ name: 'Central' }, { name: 'Microcentro' }, { name: 'Norte' }],
        selectedPlan: 'PRO'
      }
    });

    expect(accountUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantAccountId: 'acc-premium',
        selectedPlan: 'PRO',
        accountState: 'pending_payment'
      })
    );

    expect(result).toEqual({
      accountId: 'acc-premium',
      accountState: 'pending_payment',
      nextRoute: 'billing_checkout',
      selectedPlan: 'PRO'
    });
  });

  it('enforces tenant context at persistence boundary and never trusts tenant/account id from payload', async () => {
    const onboardingPersistence = await loadOnboardingPersistenceModule();
    const accountUpsertSpy = vi.fn(async () => ({ accountId: 'acc-safe', tenantAccountId: 'acc-safe' }));
    const salonReplaceSpy = vi.fn(async () => undefined);

    const service = onboardingPersistence.createOnboardingPersistenceService({
      accountRepository: {
        upsertForTenant: accountUpsertSpy
      },
      salonRepository: {
        replaceForAccount: salonReplaceSpy
      }
    });

    await expect(
      service.persistOnboardingSelection({
        tenantContext: { accountId: '' },
        payload: {
          profile: {
            ownerName: 'Unsafe',
            email: 'unsafe@turnea.app'
          },
          account: {
            businessName: 'Unsafe Beauty'
          },
          salons: [{ name: 'Central' }],
          selectedPlan: 'FREE'
        }
      })
    ).rejects.toThrow(/tenant|account|context|required/i);

    await service.persistOnboardingSelection({
      tenantContext: { accountId: 'acc-safe' },
      payload: {
        profile: {
          ownerName: 'Tenant Scoped',
          email: 'tenant@turnea.app'
        },
        account: {
          businessName: 'Scoped Beauty'
        },
        salons: [{ name: 'Central' }],
        selectedPlan: 'BASIC'
      }
    });

    expect(accountUpsertSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantAccountId: 'acc-safe'
      })
    );
    expect(salonReplaceSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantAccountId: 'acc-safe',
        accountId: 'acc-safe'
      })
    );
  });

  it('returns deterministic transition and next-route for same payload every time', async () => {
    const onboardingPersistence = await loadOnboardingPersistenceModule();

    const service = onboardingPersistence.createOnboardingPersistenceService({
      accountRepository: {
        upsertForTenant: async () => ({ accountId: 'acc-deterministic', tenantAccountId: 'acc-deterministic' })
      },
      salonRepository: {
        replaceForAccount: async () => undefined
      }
    });

    const input = {
      tenantContext: { accountId: 'acc-deterministic' },
      payload: {
        profile: {
          ownerName: 'Deterministic',
          email: 'deterministic@turnea.app'
        },
        account: {
          businessName: 'Deterministic Beauty'
        },
        salons: [{ name: 'Central' }, { name: 'Second' }],
        selectedPlan: 'MEDIUM' as const
      }
    };

    const first = await service.persistOnboardingSelection(input);
    const second = await service.persistOnboardingSelection(input);

    expect(first.accountState).toBe('pending_payment');
    expect(first.nextRoute).toBe('billing_checkout');
    expect(second).toEqual(first);
  });
});
