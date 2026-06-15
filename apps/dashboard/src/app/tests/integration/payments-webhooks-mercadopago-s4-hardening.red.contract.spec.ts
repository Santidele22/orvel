import { describe, expect, it, vi } from 'vitest';
import { MERCADO_PAGO_SKELETON_V1 } from '../fixtures/payments/mercadopago-skeleton-v1.fixture';

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
    code: 'INVALID_SIGNATURE' | 'REPLAY_DETECTED' | 'LEGACY_FORMAT_CHECK_DISABLED';
    message: string;
  };
};

type OfficialVerifierInput = {
  headers: Record<string, string>;
  rawBody: string;
  nowIso: string;
  toleranceSeconds: number;
};

type SignatureVerifier = {
  verify: (input: { headers: Record<string, string>; rawBody: string }) => boolean;
  verifyOfficial?: (input: OfficialVerifierInput) => {
    isValid: boolean;
    reason: 'VALID' | 'DIGEST_MISMATCH' | 'TIMESTAMP_OUT_OF_WINDOW' | 'FORMAT_ONLY_NOT_ALLOWED';
  };
};

type MercadoPagoWebhookSecurityApiModule = {
  createMercadoPagoWebhookHandler: (deps: {
    signatureVerifier: SignatureVerifier;
    paymentsApiAdapter: {
      getPaymentById: (input: { paymentId: string }) => Promise<{
        paymentId: string;
        status: ReconciledPaymentStatus;
        externalReference: string;
      }>;
    };
    stateTransitions: {
      applyPaymentTransition: (input: {
        provider: 'mercado_pago';
        paymentId: string;
        externalReference: string;
        reconciledStatus: ReconciledPaymentStatus;
      }) => Promise<{ applied: boolean; transitionId: string }>;
    };
    idempotency: {
      registerIfFirstSeen: (input: {
        provider: 'mercado_pago';
        providerEventId: string;
        payloadHash: string;
      }) => Promise<{ shouldProcess: boolean; dedupeKey: string }>;
    };
    logger: {
      warn: (message: string, metadata: Record<string, unknown>) => void;
    };
    compatibility?: {
      allowLegacyFormatCheck?: boolean;
    };
    security?: {
      signatureToleranceSeconds?: number;
    };
  }) => {
    handle: (input: {
      headers: Record<string, string>;
      rawBody: string;
      nowIso: string;
    }) => Promise<HandleMercadoPagoWebhookResponse>;
  };
};

type CanonicalModule = {
  buildMercadoPagoCanonicalString: (input: {
    dataId: string;
    requestId: string;
    ts: string;
  }) => string;
};

async function loadWebhookSecurityApi(): Promise<MercadoPagoWebhookSecurityApiModule> {
  try {
    const mod = await import('../../core/payments/webhooks/mercadopago-webhook-security.api');
    return mod as MercadoPagoWebhookSecurityApiModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/mercadopago-webhook-security.api.ts official-signature hardening contract (timestamp window, replay hard fail, legacy compatibility flag).'
    );
  }
}

async function loadCanonicalModule(): Promise<CanonicalModule> {
  try {
    const mod = await import('../../core/payments/webhooks/mercadopago-webhook-signature-canonical');
    return mod as CanonicalModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/mercadopago-webhook-signature-canonical.ts exporting buildMercadoPagoCanonicalString() with deterministic canonicalization and edge-case normalization.'
    );
  }
}

describe('Mercado Pago webhook security S4 RED contract (hardening)', () => {
  it('requires official verifier in production (fail-closed if verifyOfficial is missing)', async () => {
    const api = await loadWebhookSecurityApi();
    const originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    try {
      const handler = api.createMercadoPagoWebhookHandler({
        signatureVerifier: {
          verify: vi.fn(() => true)
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
        logger: { warn: vi.fn() },
        security: { signatureToleranceSeconds: 300 }
      });

      const response = await handler.handle({
        headers: {
          ...MERCADO_PAGO_SKELETON_V1.webhook.headers,
          'x-signature':
            'ts=1776765605,v1=5f6e13f10cf6f5dca50b5d446f7304b3fdf43f8fd6e1d9ec0af0b783ca50a111'
        },
        rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
        nowIso: '2026-04-21T10:00:05.000Z'
      });

      expect(response.status).toBe(401);
      expect(response.error?.message).toMatch(/official|verifyOfficial|production/i);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = originalNodeEnv;
      }
    }
  });

  it('uses official verification contract (not only legacy format-check verifier)', async () => {
    const api = await loadWebhookSecurityApi();

    const verifyOfficial = vi.fn(() => ({ isValid: false as const, reason: 'DIGEST_MISMATCH' as const }));
    const verify = vi.fn(() => true);
    const paymentsApiAdapter = {
      getPaymentById: vi.fn(async () => ({
        paymentId: 'mp_pay_0001',
        status: 'approved' as const,
        externalReference: 'ext_biz_mp_qa_001_medium_001'
      }))
    };

    const stateTransitions = {
      applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_1' }))
    };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: { verify, verifyOfficial },
      paymentsApiAdapter,
      stateTransitions,
      idempotency: {
        registerIfFirstSeen: vi.fn(async () => ({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_0001' }))
      },
      logger: { warn: vi.fn() },
      security: { signatureToleranceSeconds: 300 }
    });

    const response = await handler.handle({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(verifyOfficial).toHaveBeenCalledWith({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso,
      toleranceSeconds: 300
    });
    expect(verify).not.toHaveBeenCalled();
    expect(response).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/digest|signature|official/i)
      }
    });
    expect(paymentsApiAdapter.getPaymentById).not.toHaveBeenCalled();
    expect(stateTransitions.applyPaymentTransition).not.toHaveBeenCalled();
  });

  it('enforces timestamp tolerance window and logs anti-replay reason', async () => {
    const api = await loadWebhookSecurityApi();
    const logger = { warn: vi.fn() };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => false),
        verifyOfficial: vi.fn(() => ({ isValid: false as const, reason: 'TIMESTAMP_OUT_OF_WINDOW' as const }))
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
      logger,
      security: { signatureToleranceSeconds: 300 }
    });

    const response = await handler.handle({
      headers: {
        ...MERCADO_PAGO_SKELETON_V1.webhook.headers,
        'x-signature': 'ts=1700000000,v1=valid-but-expired-sample'
      },
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: '2026-04-21T10:00:05.000Z'
    });

    expect(response).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/timestamp|window|replay/i)
      }
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/signature|timestamp|replay/i),
      expect.objectContaining({ reason: 'timestamp_out_of_window' })
    );
  });

  it('keeps canonical string deterministic for same semantic input and edge characters', async () => {
    const canonical = await loadCanonicalModule();

    const input = {
      dataId: 'mp_pay_ñ_001',
      requestId: 'req_mp_0001',
      ts: '1710000000'
    };

    const first = canonical.buildMercadoPagoCanonicalString(input);
    const second = canonical.buildMercadoPagoCanonicalString({
      dataId: 'mp_pay_ñ_001',
      requestId: 'req_mp_0001',
      ts: '1710000000'
    });

    expect(first).toBe(second);
    expect(first).toContain('id:mp_pay_ñ_001');
    expect(first).toContain('request-id:req_mp_0001');
    expect(first).toContain('ts:1710000000');
  });

  it('treats duplicate signed event replay as explicit security rejection', async () => {
    const api = await loadWebhookSecurityApi();

    const stateTransitions = {
      applyPaymentTransition: vi.fn(async () => ({ applied: true, transitionId: 'tr_1' }))
    };
    const logger = { warn: vi.fn() };

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
      idempotency: {
        registerIfFirstSeen: vi
          .fn()
          .mockResolvedValueOnce({ shouldProcess: true, dedupeKey: 'mercado_pago:mp_evt_0001' })
          .mockResolvedValueOnce({ shouldProcess: false, dedupeKey: 'mercado_pago:mp_evt_0001' })
      },
      logger
    });

    const first = await handler.handle({
      headers: {
        ...MERCADO_PAGO_SKELETON_V1.webhook.headers,
        'x-signature': 'ts=1776765605,v1=5f6e13f10cf6f5dca50b5d446f7304b3fdf43f8fd6e1d9ec0af0b783ca50a111'
      },
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: '2026-04-21T10:00:02.000Z'
    });

    const replay = await handler.handle({
      headers: {
        ...MERCADO_PAGO_SKELETON_V1.webhook.headers,
        'x-request-id': 'req_mp_replay_0002',
        'x-signature': 'ts=1776765605,v1=5f6e13f10cf6f5dca50b5d446f7304b3fdf43f8fd6e1d9ec0af0b783ca50a111'
      },
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: '2026-04-21T10:00:03.000Z'
    });

    expect(first.status).toBe(202);
    expect(replay).toEqual({
      status: 401,
      error: {
        code: 'REPLAY_DETECTED',
        message: expect.stringMatching(/replay|duplicate/i)
      }
    });
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/replay|duplicate/i),
      expect.objectContaining({ dedupeKey: 'mercado_pago:mp_evt_0001', reason: 'replay_detected' })
    );
    expect(stateTransitions.applyPaymentTransition).toHaveBeenCalledTimes(1);
  });

  it('fails closed when verifier throws and keeps logs secret-safe', async () => {
    const api = await loadWebhookSecurityApi();

    const logger = { warn: vi.fn() };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => {
          throw new Error('boom secret=shh x-signature=ts=1710000000,v1=very-secret');
        }),
        verifyOfficial: vi.fn(() => {
          throw new Error('boom secret=shh x-signature=ts=1710000000,v1=very-secret');
        })
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
      logger
    });

    const response = await handler.handle({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(response).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/invalid|signature/i)
      }
    });

    const warningMetadata = (logger.warn as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as
      | Record<string, unknown>
      | undefined;

    expect(JSON.stringify(warningMetadata ?? {})).not.toMatch(/shh|very-secret|x-signature|rawBody/i);
  });

  it('rejects format-only signatures even when legacy fallback flag is enabled (fail-closed)', async () => {
    const api = await loadWebhookSecurityApi();

    const buildHandler = (allowLegacyFormatCheck?: boolean) =>
      api.createMercadoPagoWebhookHandler({
        signatureVerifier: {
          verify: vi.fn(() => true),
          verifyOfficial: vi.fn(() => ({ isValid: false as const, reason: 'FORMAT_ONLY_NOT_ALLOWED' as const }))
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
        logger: { warn: vi.fn() },
        compatibility: { allowLegacyFormatCheck }
      });

    const strictResponse = await buildHandler(undefined).handle({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(strictResponse).toEqual({
      status: 401,
      error: {
        code: 'LEGACY_FORMAT_CHECK_DISABLED',
        message: expect.stringMatching(/format|cryptographic|required|rejected/i)
      }
    });

    const legacyResponse = await buildHandler(true).handle({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(legacyResponse).toEqual({
      status: 401,
      error: {
        code: 'LEGACY_FORMAT_CHECK_DISABLED',
        message: expect.stringMatching(/format|cryptographic|required|rejected/i)
      }
    });
  });

  it('emits high-visibility warning when temporary legacy fallback is enabled but still rejected', async () => {
    const api = await loadWebhookSecurityApi();
    const logger = { warn: vi.fn() };

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => true),
        verifyOfficial: vi.fn(() => ({ isValid: false as const, reason: 'FORMAT_ONLY_NOT_ALLOWED' as const }))
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
      logger,
      compatibility: { allowLegacyFormatCheck: true }
    });

    const response = await handler.handle({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(response.status).toBe(401);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringMatching(/format|legacy|signature|rejected/i),
      expect.objectContaining({
        reason: expect.stringMatching(/format|legacy/i),
        visibility: 'high'
      })
    );
  });

  it('blocks legacy fallback in production even when temporary migration flag is enabled', async () => {
    const api = await loadWebhookSecurityApi();
    const originalNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';

    try {
      const handler = api.createMercadoPagoWebhookHandler({
        signatureVerifier: {
          verify: vi.fn(() => true),
          verifyOfficial: vi.fn(() => ({ isValid: false as const, reason: 'FORMAT_ONLY_NOT_ALLOWED' as const }))
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
        logger: { warn: vi.fn() },
        compatibility: { allowLegacyFormatCheck: true },
        security: { signatureToleranceSeconds: 300 }
      });

      const response = await handler.handle({
        headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
        rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
        nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
      });

      expect(response.status).toBe(401);
      expect(response.error?.message).toMatch(/format|cryptographic|required|rejected/i);
    } finally {
      if (originalNodeEnv === undefined) {
        delete process.env['NODE_ENV'];
      } else {
        process.env['NODE_ENV'] = originalNodeEnv;
      }
    }
  });

  it('returns format-only rejection code in legacy fallback path before timestamp checks', async () => {
    const api = await loadWebhookSecurityApi();

    const handler = api.createMercadoPagoWebhookHandler({
      signatureVerifier: {
        verify: vi.fn(() => true),
        verifyOfficial: vi.fn(() => ({ isValid: false as const, reason: 'FORMAT_ONLY_NOT_ALLOWED' as const }))
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
      logger: { warn: vi.fn() },
      compatibility: { allowLegacyFormatCheck: true },
      security: { signatureToleranceSeconds: 300 }
    });

    const response = await handler.handle({
      headers: {
        ...MERCADO_PAGO_SKELETON_V1.webhook.headers,
        'x-signature': 'ts=1700000000,v1=legacy-format-only-sample'
      },
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: '2026-04-21T10:00:05.000Z'
    });

    expect(response.status).toBe(401);
    expect(response.error).toEqual({
      code: 'LEGACY_FORMAT_CHECK_DISABLED',
      message: expect.stringMatching(/format|cryptographic|required|rejected/i)
    });
  });
});
