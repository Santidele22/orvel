/**
 * KB-009: MercadoPago Integration - E2E Contract Guards (TDD RED)
 *
 * Scope:
 * 1) Checkout preference creation contract
 * 2) Return state handling (success/pending/failure)
 * 3) Webhook processing and idempotency
 * 4) Signature/security validations
 * 5) Entitlement/sync side-effects after approved payment
 * 6) Observability and operational readiness checks
 */

import { describe, expect, it, vi } from 'vitest';

import { MERCADO_PAGO_SKELETON_V1 } from '../fixtures/payments/mercadopago-skeleton-v1.fixture';
import {
  createCheckoutProPreference,
  type CreateCheckoutProPreferenceResponse
} from '../../core/payments/checkout-pro/checkout-pro-preference.api';
import { resolveCheckoutProReturnState } from '../../core/payments/checkout-pro/checkout-pro-return-state.presenter';
import { handleMercadoPagoWebhook } from '../../core/payments/webhooks/mercadopago-webhook.api';
import { createMercadoPagoWebhookHandler } from '../../core/payments/webhooks/mercadopago-webhook-security.api';
import { buildMercadoPagoCanonicalString } from '../../core/payments/webhooks/mercadopago-webhook-signature-canonical';
import { decideWebhookProcessing } from '../../core/payments/webhooks/payment-webhook-idempotency';
import { createPaymentConfirmedBusinessSync } from '../../core/payments/webhooks/payment-confirmed-business-sync.service';
import { buildMercadoPagoOperationalEvent } from '../../core/payments/observability/mercadopago-operational-events';
import { runMercadoPagoOperationalSmokeChecks } from '../../core/payments/observability/mercadopago-smoke-checks';
import { evaluateMercadoPagoProductionConfigGate } from '../../core/payments/observability/mercadopago-production-config-gate';

describe('KB-009.1 - Checkout preference creation contract', () => {
  it('KB-009.1.1 @GREEN - returns MercadoPago preference contract with correlation fields', async () => {
    const response = await createCheckoutProPreference({
      businessId: 'biz_kb009_001',
      planCode: 'MEDIUM',
      title: 'Plan Medium',
      quantity: 1,
      unitPriceCents: 159900,
      payerEmail: 'owner+kb009@example.com',
      externalReference: 'ext_biz_kb009_001_medium_001',
      returnUrls: {
        successUrl: 'https://app.salon.test/payments/success',
        pendingUrl: 'https://app.salon.test/payments/pending',
        failureUrl: 'https://app.salon.test/payments/failure'
      }
    });

    expect(response.status).toBe(201);
    expect(response.data).toEqual({
      preferenceId: expect.stringMatching(/^pref_/),
      initPoint: expect.stringMatching(/^https:\/\//),
      sandboxInitPoint: expect.stringMatching(/^https:\/\//),
      externalReference: 'ext_biz_kb009_001_medium_001'
    });
  });

  it('KB-009.1.2 @RED - response includes explicit provider + contract version metadata for end-to-end auditability', async () => {
    const response = await createCheckoutProPreference({
      businessId: 'biz_kb009_001',
      planCode: 'MEDIUM',
      title: 'Plan Medium',
      quantity: 1,
      unitPriceCents: 159900,
      payerEmail: 'owner+kb009@example.com',
      externalReference: 'ext_biz_kb009_001_medium_002',
      returnUrls: {
        successUrl: 'https://app.salon.test/payments/success',
        pendingUrl: 'https://app.salon.test/payments/pending',
        failureUrl: 'https://app.salon.test/payments/failure'
      }
    });

    expect(response.status).toBe(201);
    const payload = response as CreateCheckoutProPreferenceResponse & {
      data?: CreateCheckoutProPreferenceResponse['data'] & { provider?: string; contractVersion?: string };
    };

    expect(payload.data?.provider).toBe('mercado_pago');
    expect(payload.data?.contractVersion).toBe('kb009.v1');
  });
});

describe('KB-009.2 - Return state handling (success/pending/failure)', () => {
  it('KB-009.2.1 @GREEN - resolves canonical states to deterministic UX copy', () => {
    expect(resolveCheckoutProReturnState('success').status).toBe('success');
    expect(resolveCheckoutProReturnState('pending').status).toBe('pending');
    expect(resolveCheckoutProReturnState('failure').status).toBe('failure');
  });

  it('KB-009.2.2 @RED - supports provider aliases approved/in_process/rejected mapped to success/pending/failure', () => {
    expect(resolveCheckoutProReturnState('approved').status).toBe('success');
    expect(resolveCheckoutProReturnState('in_process').status).toBe('pending');
    expect(resolveCheckoutProReturnState('rejected').status).toBe('failure');
  });
});

describe('KB-009.3 - Webhook processing and idempotency', () => {
  it('KB-009.3.1 @GREEN - provider-agnostic idempotency blocks duplicated payload hash', () => {
    const decision = decideWebhookProcessing({
      provider: 'mercado_pago',
      providerEventId: 'mp_evt_kb009_01',
      incomingPayloadHash: 'hash_abc',
      existingPayloadHash: 'hash_abc'
    });

    expect(decision).toEqual({
      shouldProcess: false,
      reason: 'DUPLICATE_EVENT',
      idempotencyKey: 'mercado_pago:mp_evt_kb009_01'
    });
  });

  it('KB-009.3.2 @GREEN - signed replay event is rejected as REPLAY_DETECTED', async () => {
    const paymentsApiAdapter = {
      getPaymentById: vi.fn(async () => ({
        paymentId: 'mp_pay_kb009_01',
        status: 'approved' as const,
        externalReference: 'ext_biz_kb009_001_medium_001'
      }))
    };

    const stateTransitions = {
      applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_kb009_01' }))
    };

    const handler = createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => false),
        verifyOfficial: vi.fn(() => ({ isValid: true as const, reason: 'VALID' as const }))
      },
      paymentsApiAdapter,
      stateTransitions,
      idempotency: {
        registerIfFirstSeen: vi.fn(async () => ({ shouldProcess: false, dedupeKey: 'mercado_pago:mp_evt_kb009_dup' }))
      },
      logger: { warn: vi.fn() }
    });

    const response = await handler.handle({
      headers: {
        'x-signature': 'ts=1710000000,v1=5f6e13f10cf6f5dca50b5d446f7304b3fdf43f8fd6e1d9ec0af0b783ca50a111',
        'x-request-id': 'req_kb009_replay'
      },
      rawBody: '{"id":"mp_evt_kb009_dup","data":{"id":"mp_pay_kb009_01"}}',
      nowIso: '2026-04-24T10:00:00.000Z'
    });

    expect(response).toEqual({
      status: 401,
      error: {
        code: 'REPLAY_DETECTED',
        message: expect.stringMatching(/replay/i)
      }
    });
    expect(paymentsApiAdapter.getPaymentById).not.toHaveBeenCalled();
    expect(stateTransitions.applyPaymentTransition).not.toHaveBeenCalled();
  });

  it('KB-009.3.3 @RED - end-to-end webhook adapter accepts valid skeleton payload and emits PROCESS decision', async () => {
    const response = await handleMercadoPagoWebhook({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(response.status).toBe(202);
    expect(response.data).toEqual(
      expect.objectContaining({
        accepted: true,
        decision: 'PROCESS',
        normalizedEvent: expect.objectContaining({
          provider: 'mercado_pago',
          providerPaymentId: 'mp_pay_0001',
          status: 'approved'
        })
      })
    );
  });
});

describe('KB-009.4 - Signature/security validations', () => {
  it('KB-009.4.1 @GREEN - rejects requests missing x-signature header', async () => {
    const handler = createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => true),
        verifyOfficial: vi.fn(() => ({ isValid: true as const, reason: 'VALID' as const }))
      },
      paymentsApiAdapter: {
        getPaymentById: vi.fn(async () => ({
          paymentId: 'mp_pay_kb009_02',
          status: 'approved' as const,
          externalReference: 'ext_biz_kb009_001_medium_002'
        }))
      },
      stateTransitions: {
        applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_kb009_02' }))
      },
      idempotency: {
        registerIfFirstSeen: vi.fn(async () => ({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_kb009_02' }))
      },
      logger: { warn: vi.fn() }
    });

    const response = await handler.handle({
      headers: { 'x-request-id': 'req_kb009_no_sig' },
      rawBody: '{"id":"mp_evt_kb009_02","data":{"id":"mp_pay_kb009_02"}}',
      nowIso: '2026-04-24T10:00:10.000Z'
    });

    expect(response).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/missing signature/i)
      }
    });
  });

  it('KB-009.4.2 @RED - canonical string normalizes request-id case for stable signature verification', () => {
    const canonical = buildMercadoPagoCanonicalString({
      dataId: 'mp_pay_0001',
      requestId: 'REQ_MP_0001',
      ts: '1710000000'
    });

    expect(canonical).toBe('id:mp_pay_0001;request-id:req_mp_0001;ts:1710000000;');
  });
});

describe('KB-009.5 - Entitlement/sync side-effects after approved payment', () => {
  it('KB-009.5.1 @GREEN - pending payment does not apply subscription/entitlement sync', async () => {
    const subscriptions = {
      upsertFromPayment: vi.fn(async () => ({ applied: true, subscriptionId: 'sub_kb009_001' }))
    };

    const entitlements = {
      syncForBusiness: vi.fn(async () => ({ synced: true, reason: 'APPLIED' as const }))
    };

    const syncService = createPaymentConfirmedBusinessSync({ subscriptions, entitlements });
    const response = await syncService.apply({
      businessId: 'biz_kb009_001',
      provider: 'mercado_pago',
      providerPaymentId: 'mp_pay_kb009_pending',
      externalReference: 'ext_biz_kb009_001_medium_003',
      reconciledStatus: 'pending',
      planCode: 'MEDIUM',
      nowIso: '2026-04-24T10:00:20.000Z'
    });

    expect(response).toEqual({
      status: 202,
      data: {
        applied: false,
        reason: 'PAYMENT_NOT_APPROVED'
      }
    });
    expect(subscriptions.upsertFromPayment).not.toHaveBeenCalled();
    expect(entitlements.syncForBusiness).not.toHaveBeenCalled();
  });

  it('KB-009.5.2 @RED - skips entitlement sync when subscription upsert reports no-op duplicate approval', async () => {
    const subscriptions = {
      upsertFromPayment: vi.fn(async () => ({ applied: false, subscriptionId: 'sub_kb009_001' }))
    };

    const entitlements = {
      syncForBusiness: vi.fn(async () => ({ synced: true, reason: 'ALREADY_APPLIED' as const }))
    };

    const syncService = createPaymentConfirmedBusinessSync({ subscriptions, entitlements });
    await syncService.apply({
      businessId: 'biz_kb009_001',
      provider: 'mercado_pago',
      providerPaymentId: 'mp_pay_kb009_approved',
      externalReference: 'ext_biz_kb009_001_medium_004',
      reconciledStatus: 'approved',
      planCode: 'MEDIUM',
      nowIso: '2026-04-24T10:00:30.000Z'
    });

    expect(entitlements.syncForBusiness).not.toHaveBeenCalled();
  });
});

describe('KB-009.6 - Observability and operational checks', () => {
  it('KB-009.6.1 @GREEN - operational event sanitizer removes credentials/secrets from metadata', () => {
    const event = buildMercadoPagoOperationalEvent({
      eventName: 'mp.webhook.signature_failed',
      correlationId: 'corr_kb009_001',
      requestId: 'req_kb009_001',
      environment: 'production',
      reason: 'digest_mismatch',
      metadata: {
        stage: 'signature_validation',
        accessToken: 'Bearer super-secret-token',
        details: {
          nested: 'ok',
          note: 'token=abc123'
        }
      }
    });

    expect(event.metadata).toEqual({
      stage: 'signature_validation',
      details: {
        nested: 'ok',
        note: '[REDACTED]'
      }
    });
  });

  it('KB-009.6.2 @GREEN - production config gate blocks missing secrets/tokens/guardrails', () => {
    const gate = evaluateMercadoPagoProductionConfigGate({
      environment: 'production',
      config: {
        webhookSecret: '',
        accessToken: '   ',
        webhookSecurityGuardrailEnabled: false
      }
    });

    expect(gate.ok).toBe(false);
    expect(gate.errors).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/webhook secret/i),
        expect.stringMatching(/access token/i),
        expect.stringMatching(/guardrail/i)
      ])
    );
  });

  it('KB-009.6.3 @RED - smoke checks target canonical MercadoPago operational routes in production', () => {
    const checks = runMercadoPagoOperationalSmokeChecks({
      environment: 'production',
      correlationId: 'corr kb009 smoke'
    });

    expect(checks.webhookPath.route).toBe('/api/payments/webhooks/mercadopago');
    expect(checks.alertPath.route).toBe('pagerduty-mercadopago');
  });
});
