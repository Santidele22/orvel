import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  BillingSubscriptionPage,
  BILLING_SUBSCRIPTION_CANCELLATION_READY_MESSAGE,
  BILLING_SUBSCRIPTION_CANCELLATION_REQUESTED_MESSAGE,
  BILLING_SUBSCRIPTION_UNAVAILABLE_MESSAGE
} from '../../features/billing/pages/billing-subscription.page';
import { CreateSubscriptionError } from '../../features/billing/data-access/payments/subscriptions/create-subscription.api';
import { requestSubscriptionCancellation } from '../../features/billing/data-access/payments/subscriptions/request-subscription-cancellation.api';

describe('BillingSubscriptionPage safe payment unavailable state', () => {
  it('surfaces a user-safe support message when subscription creation fails closed', async () => {
    const page = new BillingSubscriptionPage({
      storage: { getItem: () => 'PREMIUM' },
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
      storage: { getItem: () => 'PREMIUM' },
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

  it('does not expose a hidden multi-branch add-on activation prompt from billing', () => {
    const page = new BillingSubscriptionPage({ storage: { getItem: () => 'PREMIUM' } });

    expect('multiBranchAddOn' in page).toBe(false);
    expect('multiBranchAddOnCta' in page).toBe(false);
  });
});

describe('BillingSubscriptionPage manual cancellation request state', () => {
  it('uses the real dashboard active business storage key when requesting cancellation', async () => {
    const requestCancellation = vi.fn(async () => ({
      ok: true as const,
      requestStatus: 'manual_review' as const,
      requestedAt: '2026-07-03T00:00:00.000Z',
      reason: 'manual_request',
      message: 'Solicitud de baja recibida',
      subscription: {
        id: 'sub_123',
        status: 'active',
        periodEnd: null
      }
    }));
    const storage = {
      getItem: vi.fn((key: string) => (key === 'orvel.active_business_id' ? ' biz_active_123 ' : null))
    };

    const page = new BillingSubscriptionPage({
      mode: 'cancellation',
      storage,
      requestCancellation
    });

    await page.requestCancellation();

    expect(storage.getItem).toHaveBeenCalledWith('orvel.active_business_id');
    expect(requestCancellation).toHaveBeenCalledWith({ businessId: 'biz_active_123', reason: 'manual_request' });
  });

  it('exposes cancellation-specific heading copy in cancellation mode', () => {
    const page = new BillingSubscriptionPage({ mode: 'cancellation', storage: null });

    expect(page.heading()).toEqual({
      kicker: 'Baja de suscripción',
      title: 'Solicitud de baja manual'
    });
  });

  it('does not automatically cancel on load and explains manual processing honestly', async () => {
    const requestCancellation = vi.fn();
    const page = new BillingSubscriptionPage({
      mode: 'cancellation',
      storage: { getItem: () => 'biz_123' },
      requestCancellation
    });

    await page.initialize();

    expect(requestCancellation).not.toHaveBeenCalled();
    expect(page.state()).toEqual({
      status: 'cancellation_ready',
      message: BILLING_SUBSCRIPTION_CANCELLATION_READY_MESSAGE
    });
    expect(page.state().message).toMatch(/solicitar|procesamos manualmente|próximo ciclo/i);
    expect(page.state().message).not.toMatch(/cancelada|completada/i);
  });

  it('records a typed manual cancellation request without claiming provider cancellation', async () => {
    const requestCancellation = vi.fn(async () => ({
      ok: true as const,
      requestStatus: 'manual_review' as const,
      requestedAt: '2026-07-03T00:00:00.000Z',
      reason: 'manual_request',
      message: 'Solicitud de baja recibida',
      subscription: {
        id: 'sub_123',
        status: 'active',
        periodEnd: '2026-08-01T00:00:00.000Z'
      }
    }));

    const page = new BillingSubscriptionPage({
      mode: 'cancellation',
      resolveCancellationBusinessId: async () => 'biz_123',
      requestCancellation
    });

    await page.requestCancellation();

    expect(requestCancellation).toHaveBeenCalledWith({ businessId: 'biz_123', reason: 'manual_request' });
    expect(page.state()).toEqual({
      status: 'cancellation_requested',
      message: BILLING_SUBSCRIPTION_CANCELLATION_REQUESTED_MESSAGE
    });
    expect(page.state().message).toMatch(/recibimos|procesar manualmente|Mercado Pago|próximo ciclo/i);
    expect(page.state().message).not.toMatch(/ya está cancelada|cancelación completada/i);
  });
});

describe('billing subscription cancellation route protection', () => {
  it('protects the manual cancellation route with the dashboard auth guard', () => {
    const routesSource = readFileSync(resolve(process.cwd(), 'src/app/app.routes.ts'), 'utf8');
    const cancellationRouteMatch = routesSource.match(/path:\s*'billing\/subscription\/cancel',[\s\S]*?loadComponent:/);

    expect(cancellationRouteMatch?.[0]).toContain('canActivate: [dashboardAuthGuard]');
  });
});

describe('requestSubscriptionCancellation API contract', () => {
  it('posts a typed manual_request payload and preserves active provider state in the response', async () => {
    const invokeCancelSubscription = vi.fn(async () => ({
      data: {
        success: true as const,
        message: 'Solicitud de baja recibida',
        request: {
          status: 'manual_review' as const,
          requested_at: '2026-07-03T00:00:00.000Z',
          reason: 'manual_request'
        },
        subscription: {
          id: 'sub_123',
          status: 'active',
          period_end: '2026-08-01T00:00:00.000Z',
          provider_subscription_id: 'mp-subscription-1'
        }
      },
      error: null
    }));

    await expect(
      requestSubscriptionCancellation(
        { businessId: 'biz_123' },
        { invokeCancelSubscription }
      )
    ).resolves.toEqual({
      ok: true,
      requestStatus: 'manual_review',
      requestedAt: '2026-07-03T00:00:00.000Z',
      reason: 'manual_request',
      message: 'Solicitud de baja recibida',
      subscription: {
        id: 'sub_123',
        status: 'active',
        periodEnd: '2026-08-01T00:00:00.000Z',
        providerSubscriptionId: 'mp-subscription-1'
      }
    });
    expect(invokeCancelSubscription).toHaveBeenCalledWith({ business_id: 'biz_123', reason: 'manual_request' });
  });

  it('includes account closure date only for account cancellation responses', async () => {
    const invokeCancelSubscription = vi.fn(async () => ({
      data: {
        success: true as const,
        message: 'Baja de cuenta solicitada',
        account_closure_at: '2026-08-01T00:00:00.000Z',
        request: {
          status: 'scheduled_account_closure' as const,
          requested_at: '2026-07-03T00:00:00.000Z',
          reason: 'manual_request'
        },
        subscription: {
          id: 'sub_123',
          status: 'active',
          period_end: '2026-08-01T00:00:00.000Z'
        }
      },
      error: null
    }));

    await expect(
      requestSubscriptionCancellation(
        { businessId: 'biz_123', mode: 'account_cancellation' },
        { invokeCancelSubscription }
      )
    ).resolves.toEqual({
      ok: true,
      requestStatus: 'scheduled_account_closure',
      requestedAt: '2026-07-03T00:00:00.000Z',
      reason: 'manual_request',
      message: 'Baja de cuenta solicitada',
      subscription: {
        id: 'sub_123',
        status: 'active',
        periodEnd: '2026-08-01T00:00:00.000Z'
      },
      accountClosureAt: '2026-08-01T00:00:00.000Z'
    });
    expect(invokeCancelSubscription).toHaveBeenCalledWith({
      business_id: 'biz_123',
      reason: 'manual_request',
      mode: 'account_cancellation'
    });
  });

  it('keeps the backend NO_ACTIVE_SUBSCRIPTION error code when the function returns HTTP 404', async () => {
    const invokeCancelSubscription = vi.fn(async () => ({
      data: {
        success: false as const,
        error: 'NO_ACTIVE_SUBSCRIPTION',
        message: 'No tienes una suscripción activa para cancelar'
      },
      error: { message: 'No tienes una suscripción activa para cancelar', context: { status: 404 } }
    }));

    await expect(
      requestSubscriptionCancellation(
        { businessId: 'biz_123' },
        { invokeCancelSubscription }
      )
    ).rejects.toMatchObject({
      code: 'NO_ACTIVE_SUBSCRIPTION',
      message: 'No encontramos una suscripción activa para procesar.'
    });
  });
});
