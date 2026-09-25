import { describe, expect, it } from 'vitest';

import { getDefaultDashboardReferenceCatalog } from '../../core/catalog/reference-catalog';
import { CANONICAL_PLAN_CODES, getPlanEntitlements, normalizePlanCode } from '../../core/plans/plan-entitlements';

describe('Contract: MVP dashboard billing catalog', () => {
  it('exposes only FREE and PREMIUM canonical plans', () => {
    expect(CANONICAL_PLAN_CODES).toEqual(['FREE', 'PREMIUM']);
    expect(getDefaultDashboardReferenceCatalog().plans.map((plan) => plan.code)).toEqual(['FREE', 'PREMIUM']);
  });

  it('keeps Free capped and Premium unlimited for monthly bookings', () => {
    expect(getPlanEntitlements('FREE')).toMatchObject({ maxLocales: 1, maxMonthlyBookings: 30 });
    expect(getPlanEntitlements('PREMIUM')).toMatchObject({ maxLocales: 1, maxMonthlyBookings: null });
  });

  it('maps legacy paid plan codes to Premium during the transition', () => {
    for (const legacyCode of ['STARTER', 'GROWTH', 'PRO', 'BASIC', 'MEDIUM', 'STARTED']) {
      expect(normalizePlanCode(legacyCode)).toBe('PREMIUM');
    }
  });
});
