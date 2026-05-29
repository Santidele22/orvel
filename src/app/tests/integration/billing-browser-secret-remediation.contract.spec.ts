import { describe, expect, it } from 'vitest';
import { CreateSubscriptionError, createSubscription } from '../../features/billing/data-access/payments/subscriptions/create-subscription.api';

describe('billing browser secret remediation', () => {
  it('fails closed when no server payment boundary is injected', async () => {
    await expect(createSubscription({ planCode: 'STARTER' })).rejects.toBeInstanceOf(CreateSubscriptionError);
    await expect(createSubscription({ planCode: 'STARTER' })).rejects.toMatchObject({ code: 'SERVER_CONFIG_ERROR' });
  });
});
