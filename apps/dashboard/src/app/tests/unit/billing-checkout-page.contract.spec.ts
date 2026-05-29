import { describe, expect, it, vi } from 'vitest';

import { BillingCheckoutPage, BILLING_CHECKOUT_UNAVAILABLE_MESSAGE } from '../../features/billing/pages/billing-checkout.page';
import { CreateSubscriptionError } from '../../features/billing/data-access/payments/subscriptions/create-subscription.api';

describe('BillingCheckoutPage safe payment unavailable state', () => {
  it('surfaces a user-safe support message when subscription creation fails closed', async () => {
    const page = new BillingCheckoutPage({
      storage: { getItem: () => 'STARTER' },
      createSubscription: vi.fn(async () => {
        throw new CreateSubscriptionError('SERVER_CONFIG_ERROR', 'internal server config details');
      }),
      redirectTo: vi.fn()
    });

    await page.startCheckout();

    expect(page.state()).toEqual({
      status: 'unavailable',
      message: BILLING_CHECKOUT_UNAVAILABLE_MESSAGE
    });
  });

  it('does not redirect when the payment boundary returns no init point', async () => {
    const redirectTo = vi.fn();
    const page = new BillingCheckoutPage({
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

    await page.startCheckout();

    expect(redirectTo).not.toHaveBeenCalled();
    expect(page.state().status).toBe('unavailable');
  });
});
