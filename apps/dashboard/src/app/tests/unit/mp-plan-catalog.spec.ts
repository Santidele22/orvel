import { describe, expect, it } from 'vitest';

import { buildTierCode, resolvePlanCatalogRow } from '../../../../../supabase/functions/_shared/mp-plan-catalog';

describe('mp-plan-catalog helpers', () => {
  it('normalizes tier+cadence into canonical tier code', () => {
    expect(buildTierCode('started', 'monthly')).toBe('STARTED_MONTHLY');
    expect(buildTierCode('medium', 'quarterly')).toBe('MEDIUM_QUARTERLY');
    expect(buildTierCode('pro', 'annual')).toBe('PRO_ANNUAL');
  });

  it('resolves row by tier+cadence with fallback aliases', () => {
    const rows = [
      {
        tier: 'started',
        cadence: 'monthly',
        tier_code: 'STARTER_MONTHLY',
        preapproval_plan_id: 'plan_1',
      },
      {
        tier: 'pro',
        cadence: 'annual',
        tier_code: 'PRO_ANNUAL',
        preapproval_plan_id: 'plan_2',
      },
    ];

    const started = resolvePlanCatalogRow(rows, 'started', 'monthly');
    expect(started?.preapproval_plan_id).toBe('plan_1');

    const pro = resolvePlanCatalogRow(rows, 'pro', 'annual');
    expect(pro?.preapproval_plan_id).toBe('plan_2');
  });
});
