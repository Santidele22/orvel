import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

type AccountPlanPolicyModule = {
  resolveAccountPlanPolicy: (input: { plan: unknown; premiumPaid: boolean }) => {
    accountEnabled: boolean;
    maxSalons: number;
  };
  canCreateSalonUnderPlan: (input: { plan: unknown; premiumPaid: boolean; currentSalons: number }) => boolean;
};

async function loadAccountPlanPolicyModule(): Promise<AccountPlanPolicyModule> {
  try {
    return (await import('../../core/accounts/account-plan-policy')) as AccountPlanPolicyModule;
  } catch {
    throw new Error(
      'TODO(BB-8): keep src/app/core/accounts/account-plan-policy.ts public API and back it with src/app/core/catalog/reference-catalog.ts.'
    );
  }
}

function readAccountPlanPolicySource(): string {
  const sourcePath = path.join(process.cwd(), 'src', 'app', 'core', 'accounts', 'account-plan-policy.ts');
  expect(fs.existsSync(sourcePath), 'Missing account plan policy source file').toBe(true);
  return fs.readFileSync(sourcePath, 'utf8');
}

describe('RED contract: account plan policy uses the core reference catalog', () => {
  it('does not keep local plan aliases, limits, or canonical plan matrices as source of truth', () => {
    const source = readAccountPlanPolicySource();

    expect(source, 'Policy must import/read the core reference catalog').toMatch(/core\/catalog\/reference-catalog|\.\.\/catalog\/reference-catalog/);
    expect(source, 'Policy should normalize plans through catalog helpers').toMatch(/resolvePlanCodeFromCatalog/);
    expect(source, 'Policy should derive maxSalons from catalog maxLocales entitlements').toMatch(
      /getPlanEntitlementsFromCatalog|maxLocales/
    );

    expect(source, 'Remove local legacy alias map; aliases belong to reference-catalog').not.toMatch(/PLAN_CODE_ALIASES/);
    expect(source, 'Remove local plan limits; maxSalons must come from catalog maxLocales').not.toMatch(/PLAN_LIMITS/);
    expect(source, 'Do not use a local canonical plan array/matrix as source of truth').not.toMatch(
      /\[['"]FREE['"],\s*['"]STARTER['"],\s*['"]GROWTH['"],\s*['"]PRO['"]\]/
    );
  });

  it('normalizes legacy aliases via the catalog and reads paid maxSalons from maxLocales', async () => {
    const policy = await loadAccountPlanPolicyModule();

    expect(policy.resolveAccountPlanPolicy({ plan: ' BASIC ', premiumPaid: true })).toEqual({
      accountEnabled: true,
      maxSalons: 1
    });
    expect(policy.resolveAccountPlanPolicy({ plan: 'medium', premiumPaid: true })).toEqual({
      accountEnabled: true,
      maxSalons: 1
    });
    expect(policy.resolveAccountPlanPolicy({ plan: 'PRO', premiumPaid: true })).toEqual({
      accountEnabled: true,
      maxSalons: 1
    });
  });

  it('falls back invalid, null, empty, and non-string plans to FREE policy', async () => {
    const policy = await loadAccountPlanPolicyModule();

    for (const plan of [null, undefined, '', 'enterprise', 123, { code: 'PRO' }]) {
      expect(policy.resolveAccountPlanPolicy({ plan, premiumPaid: true }), `plan=${String(plan)}`).toEqual({
        accountEnabled: true,
        maxSalons: 1
      });
    }
  });

  it('keeps non-FREE unpaid accounts disabled with one salon max', async () => {
    const policy = await loadAccountPlanPolicyModule();

    for (const plan of ['STARTER', 'BASIC', 'GROWTH', 'MEDIUM', 'PRO']) {
      expect(policy.resolveAccountPlanPolicy({ plan, premiumPaid: false }), plan).toEqual({
        accountEnabled: false,
        maxSalons: 1
      });
    }
  });

  it('keeps canCreateSalonUnderPlan derived from resolveAccountPlanPolicy', async () => {
    const source = readAccountPlanPolicySource();
    expect(source, 'canCreateSalonUnderPlan must call resolveAccountPlanPolicy instead of duplicating limits').toMatch(
      /canCreateSalonUnderPlan[\s\S]*resolveAccountPlanPolicy/
    );

    const policy = await loadAccountPlanPolicyModule();
    expect(policy.canCreateSalonUnderPlan({ plan: 'MEDIUM', premiumPaid: true, currentSalons: 0 })).toBe(true);
    expect(policy.canCreateSalonUnderPlan({ plan: 'MEDIUM', premiumPaid: true, currentSalons: 1 })).toBe(false);
    expect(policy.canCreateSalonUnderPlan({ plan: 'MEDIUM', premiumPaid: false, currentSalons: 1 })).toBe(false);
  });
});
