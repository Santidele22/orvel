import { describe, expect, it, vi } from 'vitest';

type WebhookDecision = 'PROCESS' | 'IGNORE_DUPLICATE';
type ReconciledPaymentStatus = 'approved' | 'pending' | 'rejected' | 'cancelled';

type HandleMercadoPagoWebhookResponse = {
  status: 202 | 200 | 401;
  data?: {
    accepted: boolean;
    decision: WebhookDecision;
    dedupeKey: string;
    reconciledStatus?: ReconciledPaymentStatus;
  };
  error?: {
    code: 'INVALID_SIGNATURE';
    message: string;
  };
};

type SignatureVerifier = {
  verify: (input: { headers: Record<string, string>; rawBody: string }) => boolean;
  verifyOfficial?: (input: {
    headers: Record<string, string>;
    rawBody: string;
    nowIso: string;
    toleranceSeconds: number;
  }) => {
    isValid: boolean;
    reason: 'VALID' | 'DIGEST_MISMATCH' | 'TIMESTAMP_OUT_OF_WINDOW' | 'FORMAT_ONLY_NOT_ALLOWED';
  };
};

type MercadoPagoPaymentsApiAdapter = {
  getPaymentById: (input: { paymentId: string }) => Promise<{
    paymentId: string;
    status: ReconciledPaymentStatus;
    externalReference: string;
  }>;
};

type PaymentStateTransitionRepository = {
  applyPaymentTransition: (input: {
    provider: 'mercado_pago';
    paymentId: string;
    externalReference: string;
    reconciledStatus: ReconciledPaymentStatus;
  }) => Promise<{ applied: boolean; transitionId: string }>;
};

type WebhookIdempotencyRepository = {
  registerIfFirstSeen: (input: { provider: 'mercado_pago'; providerEventId: string; payloadHash: string }) => Promise<{
    shouldProcess: boolean;
    dedupeKey: string;
  }>;
};

type SafeLogger = {
  warn: (message: string, metadata: Record<string, unknown>) => void;
};

type MercadoPagoWebhookSecurityApiModule = {
  createMercadoPagoWebhookHandler: (deps: {
    signatureVerifier: SignatureVerifier;
    paymentsApiAdapter: MercadoPagoPaymentsApiAdapter;
    stateTransitions: PaymentStateTransitionRepository;
    idempotency: WebhookIdempotencyRepository;
    logger: SafeLogger;
  }) => {
    handle: (input: {
      headers: Record<string, string>;
      rawBody: string;
      nowIso: string;
    }) => Promise<HandleMercadoPagoWebhookResponse>;
  };
};

const RAW_WEBHOOK_APPROVED = JSON.stringify({
  id: 'mp_evt_0001',
  action: 'payment.updated',
  type: 'payment',
  data: { id: 'mp_pay_0001' },
  external_reference: 'ext_biz_mp_qa_001_medium_001',
  status: 'pending'
});

async function loadWebhookSecurityApi(): Promise<MercadoPagoWebhookSecurityApiModule> {
  try {
    const mod = await import('../../core/payments/webhooks/mercadopago-webhook-security.api');
    return mod as MercadoPagoWebhookSecurityApiModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/mercadopago-webhook-security.api.ts exporting createMercadoPagoWebhookHandler() with signature validation, server-truth reconciliation and idempotent processing.'
    );
  }
}

describe('Mercado Pago webhook security S2 RED contract', () => {
  it('rejects missing or invalid signature headers', async () => {
    const api = await loadWebhookSecurityApi();

    const paymentsApiAdapter: MercadoPagoPaymentsApiAdapter = {
      getPaymentById: vi.fn(async () => ({
        paymentId: 'mp_pay_0001',
        status: 'approved',
        externalReference: 'ext_biz_mp_qa_001_medium_001'
      }))
    };

    const stateTransitions: PaymentStateTransitionRepository = {
      applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_1' }))
    };

    const idempotency: WebhookIdempotencyRepository = {
      registerIfFirstSeen: vi.fn(async () => ({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_0001' }))
    };

    const logger: SafeLogger = { warn: vi.fn() };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => false),
        verifyOfficial: vi.fn(() => ({ isValid: false, reason: 'DIGEST_MISMATCH' as const }))
      },
      paymentsApiAdapter,
      stateTransitions,
      idempotency,
      logger
    });

    const missingHeader = await handler.handle({
      headers: { 'x-request-id': 'req_mp_0001' },
      rawBody: RAW_WEBHOOK_APPROVED,
      nowIso: '2026-04-21T10:00:00.000Z'
    });

    expect(missingHeader).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/signature|missing|invalid/i)
      }
    });

    const invalidSignature = await handler.handle({
      headers: {
        'x-signature': 'ts=1710000000,v1=invalid-signature',
        'x-request-id': 'req_mp_0002'
      },
      rawBody: RAW_WEBHOOK_APPROVED,
      nowIso: '2026-04-21T10:00:01.000Z'
    });

    expect(invalidSignature).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/signature|missing|invalid/i)
      }
    });

    expect(paymentsApiAdapter.getPaymentById).not.toHaveBeenCalled();
    expect(stateTransitions.applyPaymentTransition).not.toHaveBeenCalled();
  });

  it('reconciles against Mercado Pago API before applying transition (server truth)', async () => {
    const api = await loadWebhookSecurityApi();

    const paymentsApiAdapter: MercadoPagoPaymentsApiAdapter = {
      getPaymentById: vi.fn(async () => ({
        paymentId: 'mp_pay_0001',
        status: 'approved',
        externalReference: 'ext_biz_mp_qa_001_medium_001'
      }))
    };

    const stateTransitions: PaymentStateTransitionRepository = {
      applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_1' }))
    };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => true),
        verifyOfficial: vi.fn(() => ({ isValid: true as const, reason: 'VALID' as const }))
      },
      paymentsApiAdapter,
      stateTransitions,
      idempotency: {
        registerIfFirstSeen: vi.fn(async () => ({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_0001' }))
      },
      logger: { warn: vi.fn() }
    });

    const response = await handler.handle({
      headers: {
        'x-signature': 'ts=1710000000,v1=valid-signature-placeholder',
        'x-request-id': 'req_mp_0003'
      },
      rawBody: RAW_WEBHOOK_APPROVED,
      nowIso: '2026-04-21T10:00:02.000Z'
    });

    expect(paymentsApiAdapter.getPaymentById).toHaveBeenCalledWith({ paymentId: 'mp_pay_0001' });
    expect(stateTransitions.applyPaymentTransition).toHaveBeenCalledWith({
      provider: 'mercado_pago',
      paymentId: 'mp_pay_0001',
      externalReference: 'ext_biz_mp_qa_001_medium_001',
      reconciledStatus: 'approved'
    });

    const adapterOrder = (paymentsApiAdapter.getPaymentById as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const transitionOrder = (stateTransitions.applyPaymentTransition as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(adapterOrder).toBeLessThan(transitionOrder);

    expect(response).toEqual({
      status: 202,
      data: {
        accepted: true,
        decision: 'PROCESS',
        dedupeKey: 'mercado_pago:mp_evt_0001',
        reconciledStatus: 'approved'
      }
    });
  });

  it('is idempotent: duplicate notifications cause one effective transition only', async () => {
    const api = await loadWebhookSecurityApi();

    const stateTransitions: PaymentStateTransitionRepository = {
      applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_1' }))
    };

    const idempotency: WebhookIdempotencyRepository = {
      registerIfFirstSeen: vi
        .fn()
        .mockResolvedValueOnce({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_0001' })
        .mockResolvedValueOnce({ shouldProcess: false, dedupeKey: 'mercado_pago:mp_evt_0001' })
    };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => true),
        verifyOfficial: vi.fn(() => ({ isValid: true as const, reason: 'VALID' as const }))
      },
      paymentsApiAdapter: {
        getPaymentById: vi.fn(async () => ({
          paymentId: 'mp_pay_0001',
          status: 'approved',
          externalReference: 'ext_biz_mp_qa_001_medium_001'
        }))
      },
      stateTransitions,
      idempotency,
      logger: { warn: vi.fn() }
    });

    const first = await handler.handle({
      headers: {
        'x-signature': 'ts=1710000000,v1=valid-signature-placeholder',
        'x-request-id': 'req_mp_0004'
      },
      rawBody: RAW_WEBHOOK_APPROVED,
      nowIso: '2026-04-21T10:00:03.000Z'
    });

    const replay = await handler.handle({
      headers: {
        'x-signature': 'ts=1710000000,v1=valid-signature-placeholder',
        'x-request-id': 'req_mp_0005'
      },
      rawBody: RAW_WEBHOOK_APPROVED,
      nowIso: '2026-04-21T10:00:04.000Z'
    });

    expect(first).toEqual({
      status: 202,
      data: {
        accepted: true,
        decision: 'PROCESS',
        dedupeKey: 'mercado_pago:mp_evt_0001',
        reconciledStatus: 'approved'
      }
    });

    expect(replay).toEqual({
      status: 200,
      data: {
        accepted: true,
        decision: 'IGNORE_DUPLICATE',
        dedupeKey: 'mercado_pago:mp_evt_0001'
      }
    });

    expect(idempotency.registerIfFirstSeen).toHaveBeenCalledTimes(2);
    expect(stateTransitions.applyPaymentTransition).toHaveBeenCalledTimes(1);
  });

  it('logs invalid attempts with safe metadata only (no secrets)', async () => {
    const api = await loadWebhookSecurityApi();
    const warn = vi.fn();

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => false),
        verifyOfficial: vi.fn(() => ({ isValid: false as const, reason: 'DIGEST_MISMATCH' as const }))
      },
      paymentsApiAdapter: {
        getPaymentById: vi.fn(async () => ({
          paymentId: 'mp_pay_0001',
          status: 'approved',
          externalReference: 'ext_biz_mp_qa_001_medium_001'
        }))
      },
      stateTransitions: {
        applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_1' }))
      },
      idempotency: {
        registerIfFirstSeen: vi.fn(async () => ({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_0001' }))
      },
      logger: { warn }
    });

    await handler.handle({
      headers: {
        'x-signature': 'ts=1710000000,v1=invalid-signature',
        'x-request-id': 'req_mp_0006'
      },
      rawBody: RAW_WEBHOOK_APPROVED,
      nowIso: '2026-04-21T10:00:05.000Z'
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringMatching(/invalid|signature|official|webhook/i),
      expect.objectContaining({
        provider: 'mercado_pago',
        requestId: 'req_mp_0006',
        reason: expect.stringMatching(/digest|signature|invalid/i)
      })
    );

    const loggedPayload = JSON.stringify(warn.mock.calls[0]);
    expect(loggedPayload).not.toMatch(/invalid-signature|ts=1710000000,v1=invalid-signature|x-signature/i);
  });
});
