import { describe, expect, it } from 'vitest';
import {
  PLAN_ENTITLEMENTS,
  formatPlanLimitCopy,
  formatPlanLimitError,
  getPlanEntitlements,
  resolvePlanCodeFromContext
} from '../lib/plan-entitlements';

describe('Contract: landing plan entitlements and signup context resolution', () => {
  it('keeps salon limits aligned with business rules (FREE=1, paid premium tiers=3..5)', () => {
    expect(PLAN_ENTITLEMENTS.FREE.maxLocales).toBe(1);
    expect(PLAN_ENTITLEMENTS.BASIC.maxLocales).toBe(3);
    expect(PLAN_ENTITLEMENTS.MEDIUM.maxLocales).toBe(4);
    expect(PLAN_ENTITLEMENTS.PRO.maxLocales).toBe(5);
  });

  it('resolves plan from query first, then storage, then FREE fallback', () => {
    const sessionStorage = {
      getItem: (key: string) => (key === 'orvel.signup.plan' ? 'pro' : null)
    };

    const localStorage = {
      getItem: (key: string) => (key === 'orvel.plan' ? 'medium' : null)
    };

    expect(
      resolvePlanCodeFromContext({
        searchParams: new URLSearchParams('plan=basic'),
        sessionStorage,
        localStorage
      })
    ).toBe('BASIC');

    expect(resolvePlanCodeFromContext({ searchParams: new URLSearchParams(), sessionStorage, localStorage })).toBe(
      'PRO'
    );

    expect(resolvePlanCodeFromContext({ searchParams: new URLSearchParams() })).toBe('FREE');
  });

  it('maps public.plans aliases to the same dashboard entitlement plan', () => {
    expect(resolvePlanCodeFromContext({ searchParams: new URLSearchParams('plan=STARTED') })).toBe('BASIC');
    expect(resolvePlanCodeFromContext({ searchParams: new URLSearchParams('plan=STARTER') })).toBe('BASIC');
    expect(resolvePlanCodeFromContext({ searchParams: new URLSearchParams('plan=basic') })).toBe('BASIC');
    expect(resolvePlanCodeFromContext({ searchParams: new URLSearchParams('plan=GROWTH') })).toBe('MEDIUM');
  });

  it('builds deterministic plan copy/error strings and exposes updated plan entitlements', () => {
    expect(formatPlanLimitCopy('FREE')).toBe('Plan FREE: seleccioná hasta 1 rubro o servicio.');
    expect(formatPlanLimitCopy('MEDIUM')).toMatch(/Plan MEDIUM/i);
    expect(formatPlanLimitError('PRO')).toMatch(/plan PRO/i);
    expect(getPlanEntitlements('medium').maxLocales).toBe(4);
  });
});
