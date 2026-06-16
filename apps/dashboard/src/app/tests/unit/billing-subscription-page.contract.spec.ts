import { describe, expect, it, vi } from 'vitest';

import {
  BillingSubscriptionPage,
  BILLING_MULTI_BRANCH_ADD_ON_SAFE_CTA,
  BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE
} from '../../features/billing/pages/billing-subscription.page';
import { CreateSubscriptionError } from '../../features/billing/data-access/payments/subscriptions/create-subscription.api';

describe('BillingSubscriptionPage safe payment unavailable state', () => {
  it('surfaces a user-safe support message when subscription creation fails closed', async () => {
    const page = new BillingSubscriptionPage({
      storage: { getItem: () => 'STARTER' },
      createSubscription: vi.fn(async () => {
        throw new CreateSubscriptionError('SERVER_CONFIG_ERROR', 'internal server config details');
      }),
      redirectTo: vi.fn()
    });

    await page.startSubscription();

    expect(page.state()).toEqual({
      status: 'unavailable',
      message: BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE
    });
  });

  it('does not redirect when the payment boundary returns no init point', async () => {
    const redirectTo = vi.fn();
    const page = new BillingSubscriptionPage({
      storage: { getItem: () => 'GROWTH' },
      createSubscription: vi.fn(async () => ({
        ok: false,
        initPoint: null,
        subscriptionId: '',
        status: 'pending',
        message: 'unavailable'
      })),
      redirectTo
    });

    await page.startSubscription();

    expect(redirectTo).not.toHaveBeenCalled();
    expect(page.state().status).toBe('unavailable');
  });

  it('exposes multi-branch as a separate ARS 20,000/month add-on with safe activation copy', () => {
    const page = new BillingSubscriptionPage({ storage: { getItem: () => 'PRO' } });

    expect(page.multiBranchAddOn()).toMatchObject({
      code: 'MULTI_BRANCH',
      label: 'Sucursales adicionales / Multi-sucursal',
      priceMonthlyCents: 2_000_000,
      billingCadence: 'monthly'
    });
    expect(page.formatMonthlyPrice(page.multiBranchAddOn().priceMonthlyCents)).toBe('$\u00a020.000');
    expect(page.multiBranchAddOnCta()).toBe(BILLING_MULTI_BRANCH_ADD_ON_SAFE_CTA);
    expect(page.multiBranchAddOnCta()).toMatch(/soporte/i);
    expect(page.multiBranchAddOnCta()).toMatch(/No iniciamos un checkout automático/i);
  });
});
