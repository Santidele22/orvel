import { describe, expect, it } from 'vitest';
import {
  PLAN_ENTITLEMENTS,
  formatPlanLimitCopy,
  formatPlanLimitError,
  getPlanEntitlements,
  resolvePlanCodeFromContext
} from '../lib/plan-entitlements';

describe('Contract: landing plan entitlements and signup context resolution', () => {
  it('keeps all canonical base plan salon limits at exactly one local', () => {
    expect(Object.entries(PLAN_ENTITLEMENTS)).toEqual(
      expect.arrayContaining([
        ['FREE', expect.objectContaining({ maxLocales: 1 })],
        ['BASIC', expect.objectContaining({ maxLocales: 1 })],
        ['MEDIUM', expect.objectContaining({ maxLocales: 1 })],
        ['PRO', expect.objectContaining({ maxLocales: 1 })]
      ])
    );
  });

  it('keeps public.plans legacy aliases on one-local base entitlements', () => {
    for (const alias of ['STARTED', 'STARTER', 'GROWTH', 'basic', 'medium', 'pro']) {
      expect(getPlanEntitlements(alias).maxLocales).toBe(1);
    }
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
    expect(getPlanEntitlements('medium').maxLocales).toBe(1);
  });
});
