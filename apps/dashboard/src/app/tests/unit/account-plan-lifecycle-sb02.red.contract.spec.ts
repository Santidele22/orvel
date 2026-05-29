import { describe, expect, it } from 'vitest';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type AccountPlanPolicyModule = {
  resolveAccountPlanPolicy: (input: { plan: unknown; premiumPaid: boolean }) => {
    accountEnabled: boolean;
    maxSalons: number;
  };
  canCreateSalonUnderPlan: (input: { plan: unknown; premiumPaid: boolean; currentSalons: number }) => boolean;
};

async function loadAccountPlanPolicyModule(): Promise<AccountPlanPolicyModule> {
  try {
    const mod = await import('../../core/accounts/account-plan-policy');
    return mod as AccountPlanPolicyModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/accounts/account-plan-policy.ts exporting resolveAccountPlanPolicy({ plan, premiumPaid }) and canCreateSalonUnderPlan({ plan, premiumPaid, currentSalons }).'
    );
  }
}

describe('SB-02 RED contract: account/plan lifecycle + salon limits', () => {
  it('FREE plan enables account immediately and limits salon creation to exactly 1', async () => {
    const policy = await loadAccountPlanPolicyModule();

    const free = policy.resolveAccountPlanPolicy({ plan: 'FREE', premiumPaid: false });

    expect(free).toEqual({
      accountEnabled: true,
      maxSalons: 1
    });

    expect(policy.canCreateSalonUnderPlan({ plan: 'FREE', premiumPaid: false, currentSalons: 0 })).toBe(true);
    expect(policy.canCreateSalonUnderPlan({ plan: 'FREE', premiumPaid: false, currentSalons: 1 })).toBe(false);
  });

  it('premium paid tiers map to salon limits 3..5 (BASIC=3, MEDIUM=4, PRO=5)', async () => {
    const policy = await loadAccountPlanPolicyModule();

    const expected: Record<Exclude<PlanCode, 'FREE'>, number> = {
      BASIC: 3,
      MEDIUM: 4,
      PRO: 5
    };

    (Object.keys(expected) as Array<Exclude<PlanCode, 'FREE'>>).forEach((plan) => {
      expect(policy.resolveAccountPlanPolicy({ plan, premiumPaid: true }).maxSalons).toBe(expected[plan]);
    });
  });

  it('prevents multi-salon access when premium plan is not paid yet', async () => {
    const policy = await loadAccountPlanPolicyModule();

    (['BASIC', 'MEDIUM', 'PRO'] as const).forEach((plan) => {
      expect(policy.resolveAccountPlanPolicy({ plan, premiumPaid: false }).maxSalons).toBe(1);
      expect(policy.canCreateSalonUnderPlan({ plan, premiumPaid: false, currentSalons: 1 })).toBe(false);
    });
  });

  it('prevents creating salons above allowed max for every supported tier', async () => {
    const policy = await loadAccountPlanPolicyModule();

    const samples: Array<{ plan: PlanCode; premiumPaid: boolean; currentSalons: number; expected: boolean }> = [
      { plan: 'FREE', premiumPaid: false, currentSalons: 0, expected: true },
      { plan: 'FREE', premiumPaid: false, currentSalons: 1, expected: false },
      { plan: 'BASIC', premiumPaid: true, currentSalons: 2, expected: true },
      { plan: 'BASIC', premiumPaid: true, currentSalons: 3, expected: false },
      { plan: 'MEDIUM', premiumPaid: true, currentSalons: 3, expected: true },
      { plan: 'MEDIUM', premiumPaid: true, currentSalons: 4, expected: false },
      { plan: 'PRO', premiumPaid: true, currentSalons: 4, expected: true },
      { plan: 'PRO', premiumPaid: true, currentSalons: 5, expected: false }
    ];

    samples.forEach((sample) => {
      expect(
        policy.canCreateSalonUnderPlan({
          plan: sample.plan,
          premiumPaid: sample.premiumPaid,
          currentSalons: sample.currentSalons
        }),
        `${sample.plan} paid=${sample.premiumPaid} current=${sample.currentSalons}`
      ).toBe(sample.expected);
    });
  });
});
