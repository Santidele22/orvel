import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

type PlanCode = string | null | undefined;
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
  selectedPlan: PlanCode;
};

type PersistOnboardingResult = {
  accountId: string;
  accountState: AccountState;
  nextRoute: NextRouteDecision;
  selectedPlan: string;
};

const ONBOARDING_PERSISTENCE_SOURCE = path.resolve(
  process.cwd(),
  'src/app/features/onboarding/data-access/onboarding-persistence.service.ts'
);

function readOnboardingPersistenceSource(): string {
  return fs.readFileSync(ONBOARDING_PERSISTENCE_SOURCE, 'utf8');
}

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
    const mod = await import('../../features/onboarding/data-access/onboarding-persistence.service');
    return mod as OnboardingPersistenceModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/features/onboarding/data-access/onboarding-persistence.service.ts exporting createOnboardingPersistenceService({ accountRepository, salonRepository }) and persistOnboardingSelection({ tenantContext, payload }).'
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

  it('marks premium onboarding as pending_payment until payment is confirmed and routes to subscription', async () => {
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
      nextRoute: 'billing_subscription',
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
    expect(first.nextRoute).toBe('billing_subscription');
    expect(second).toEqual(first);
  });

  it.each(['STARTER', 'GROWTH'] as const)(
    'accepts canonical %s as a first-class catalog plan and stores it without legacy indirection',
    async (selectedPlan) => {
      const onboardingPersistence = await loadOnboardingPersistenceModule();
      const accountUpsertSpy = vi.fn(async () => ({
        accountId: `acc-${selectedPlan}`,
        tenantAccountId: `acc-${selectedPlan}`
      }));
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
        tenantContext: { accountId: `acc-${selectedPlan}` },
        payload: {
          profile: {
            ownerName: `${selectedPlan} Owner`,
            email: `${selectedPlan.toLowerCase()}@turnea.app`
          },
          account: {
            businessName: `${selectedPlan} Beauty`
          },
          salons: [{ name: 'Central' }, { name: 'Second' }],
          selectedPlan
        }
      });

      expect(accountUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedPlan,
          accountState: 'pending_payment'
        })
      );
      expect(result).toEqual({
        accountId: `acc-${selectedPlan}`,
        accountState: 'pending_payment',
        nextRoute: 'billing_subscription',
        selectedPlan
      });
    }
  );

  it.each([
    ['BASIC', 'STARTER'],
    ['MEDIUM', 'GROWTH']
  ] as const)('normalizes legacy alias %s to canonical %s before storing and decisioning', async (legacyPlan, canonicalPlan) => {
    const onboardingPersistence = await loadOnboardingPersistenceModule();
    const accountUpsertSpy = vi.fn(async () => ({
      accountId: `acc-${legacyPlan}`,
      tenantAccountId: `acc-${legacyPlan}`
    }));
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
      tenantContext: { accountId: `acc-${legacyPlan}` },
      payload: {
        profile: {
          ownerName: `${legacyPlan} Owner`,
          email: `${legacyPlan.toLowerCase()}@turnea.app`
        },
        account: {
          businessName: `${legacyPlan} Beauty`
        },
        salons: [{ name: 'Central' }, { name: 'Second' }],
        selectedPlan: legacyPlan
      }
    });

    expect(accountUpsertSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        selectedPlan: canonicalPlan,
        accountState: 'pending_payment'
      })
    );
    expect(result).toEqual({
      accountId: `acc-${legacyPlan}`,
      accountState: 'pending_payment',
      nextRoute: 'billing_subscription',
      selectedPlan: canonicalPlan
    });
  });

  it.each([null, undefined, '', '   ', 'ENTERPRISE'] as const)(
    'falls back unknown or empty plan %s to FREE consistently at persistence boundary',
    async (selectedPlan) => {
      const onboardingPersistence = await loadOnboardingPersistenceModule();
      const accountUpsertSpy = vi.fn(async () => ({ accountId: 'acc-fallback', tenantAccountId: 'acc-fallback' }));
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
        tenantContext: { accountId: 'acc-fallback' },
        payload: {
          profile: {
            ownerName: 'Fallback Owner',
            email: 'fallback@turnea.app'
          },
          account: {
            businessName: 'Fallback Beauty'
          },
          salons: [{ name: 'Central' }, { name: 'Second' }],
          selectedPlan
        }
      });

      expect(accountUpsertSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          selectedPlan: 'FREE',
          accountState: 'enabled'
        })
      );
      expect(result).toEqual({
        accountId: 'acc-fallback',
        accountState: 'enabled',
        nextRoute: 'dashboard_home',
        selectedPlan: 'FREE'
      });
    }
  );

  it('uses catalog/account plan policy normalization instead of local FREE-vs-premium branching', () => {
    const source = readOnboardingPersistenceSource();

    expect(source, 'Onboarding persistence must import the catalog-backed account plan policy or plan normalizer').toMatch(
      /account-plan-policy|normalizePlanCode|resolvePlanCodeFromCatalog/
    );
    expect(source, 'Do not keep legacy BASIC/MEDIUM as local onboarding source of truth').not.toMatch(
      /type\s+PlanCode\s*=\s*['"]FREE['"]\s*\|\s*['"]BASIC['"]\s*\|\s*['"]MEDIUM['"]\s*\|\s*['"]PRO['"]/
    );
    expect(source, 'Transition decisions must not branch only on raw payload.selectedPlan === FREE').not.toMatch(
      /payload\.selectedPlan\s*={2,3}\s*['"]FREE['"]/
    );
    expect(source, 'A local resolveTransition(plan) helper must not decide premium/free from raw plan === FREE').not.toMatch(
      /function\s+resolveTransition\s*\(\s*plan[\s\S]*?plan\s*={2,3}\s*['"]FREE['"]/
    );
  });
});
