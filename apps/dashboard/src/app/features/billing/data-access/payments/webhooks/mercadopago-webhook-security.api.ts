async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

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
    code: 'INVALID_SIGNATURE' | 'REPLAY_DETECTED' | 'LEGACY_FORMAT_CHECK_DISABLED' | 'INVALID_PAYLOAD';
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

type ParsedWebhook = {
  providerEventId: string;
  paymentId: string;
};

type OfficialVerificationDecision =
  | { ok: true }
  | {
      ok: false;
      response: HandleMercadoPagoWebhookResponse;
    };

async function buildPayloadHash(rawBody: string): Promise<string> {
  return sha256Hex(rawBody);
}

function parseWebhook(rawBody: string): ParsedWebhook {
  const parsed = JSON.parse(rawBody) as {
    id?: string;
    data?: { id?: string };
  };

  return {
    providerEventId: parsed.id ?? '',
    paymentId: parsed.data?.id ?? ''
  };
}

function isLikelyCryptographicSignature(signatureHeader: string): boolean {
  const signatureToken = signatureHeader
    .split(',')
    .map((part) => part.trim())
    .find((part) => part.toLowerCase().startsWith('v1='));

  if (!signatureToken) {
    return false;
  }

  const value = signatureToken.slice(3).trim();
  return /^[a-f0-9]{64}$/i.test(value);
}

function sanitizeVerifierError(error: unknown): { errorName: string } {
  if (error instanceof Error) {
    return { errorName: error.name };
  }

  return { errorName: 'UnknownVerifierError' };
}

function buildInvalidSignatureResponse(message: string): HandleMercadoPagoWebhookResponse {
  return {
    status: 401,
    error: {
      code: 'INVALID_SIGNATURE',
      message
    }
  };
}

export function createMercadoPagoWebhookHandler(deps: {
  signatureVerifier: SignatureVerifier;
  paymentsApiAdapter: MercadoPagoPaymentsApiAdapter;
  stateTransitions: PaymentStateTransitionRepository;
  idempotency: WebhookIdempotencyRepository;
  logger: SafeLogger;
  compatibility?: {
    allowLegacyFormatCheck?: boolean;
  };
  security?: {
    signatureToleranceSeconds?: number;
  };
}) {
  const signatureToleranceSeconds = deps.security?.signatureToleranceSeconds;
  const officialToleranceSeconds = signatureToleranceSeconds ?? 300;

  const verifySignature = (input: {
    headers: Record<string, string>;
    rawBody: string;
    nowIso: string;
    requestId: string;
  }): OfficialVerificationDecision => {
    if (!deps.signatureVerifier.verifyOfficial) {
      deps.logger.warn('Mercado Pago webhook official verifier is required for acceptance', {
        provider: 'mercado_pago',
        requestId: input.requestId,
        reason: 'official_verifier_missing',
        visibility: 'high',
        metric: 'mercado_pago_webhook_official_verifier_missing'
      });

      return {
        ok: false,
        response: buildInvalidSignatureResponse(
          'Official signature verification (verifyOfficial) is required and unavailable. Request rejected.'
        )
      };
    }

    try {
      const officialDecision = deps.signatureVerifier.verifyOfficial({
        headers: input.headers,
        rawBody: input.rawBody,
        nowIso: input.nowIso,
        toleranceSeconds: officialToleranceSeconds
      });

      if (officialDecision.isValid) {
        return { ok: true };
      }

      if (officialDecision.reason === 'TIMESTAMP_OUT_OF_WINDOW') {
        deps.logger.warn('Mercado Pago webhook signature timestamp outside tolerance window', {
          provider: 'mercado_pago',
          requestId: input.requestId,
          reason: 'timestamp_out_of_window'
        });

        return {
          ok: false,
          response: buildInvalidSignatureResponse('Invalid signature: timestamp outside tolerance window (possible replay).')
        };
      }

      if (officialDecision.reason === 'FORMAT_ONLY_NOT_ALLOWED') {
        deps.logger.warn('Mercado Pago webhook rejected: format-only signature is not accepted', {
          provider: 'mercado_pago',
          requestId: input.requestId,
          reason: 'format_only_signature_rejected',
          visibility: 'high',
          metric: 'mercado_pago_webhook_format_only_rejected'
        });

        return {
          ok: false,
          response: {
            status: 401,
            error: {
              code: 'LEGACY_FORMAT_CHECK_DISABLED',
              message: 'Format-only signature checks are rejected. Official cryptographic verification is required.'
            }
          }
        };
      }

      deps.logger.warn('Invalid Mercado Pago webhook signature (official verifier)', {
        provider: 'mercado_pago',
        requestId: input.requestId,
        reason: 'digest_mismatch'
      });

      return {
        ok: false,
        response: buildInvalidSignatureResponse('Invalid official signature digest.')
      };
    } catch (error) {
      deps.logger.warn('Mercado Pago webhook signature verifier failed (official mode)', {
        provider: 'mercado_pago',
        requestId: input.requestId,
        reason: 'verifier_exception',
        verifierPath: 'official',
        ...sanitizeVerifierError(error)
      });

      return {
        ok: false,
        response: buildInvalidSignatureResponse('Invalid signature.')
      };
    }

  };

  return {
    handle: async (input: {
      headers: Record<string, string>;
      rawBody: string;
      nowIso: string;
    }): Promise<HandleMercadoPagoWebhookResponse> => {
      const signatureHeader = input.headers['x-signature'];
      const requestId = input.headers['x-request-id'] ?? 'unknown';

      if (!signatureHeader) {
        deps.logger.warn('Invalid Mercado Pago webhook signature', {
          provider: 'mercado_pago',
          requestId,
          reason: 'missing_signature'
        });

        return {
          status: 401,
          error: {
            code: 'INVALID_SIGNATURE',
            message: 'Missing signature header.'
          }
        };
      }

      const signatureVerification = verifySignature({
        headers: input.headers,
        rawBody: input.rawBody,
        nowIso: input.nowIso,
        requestId
      });

      if (!signatureVerification.ok) {
        return signatureVerification.response;
      }

      const parsedWebhook = parseWebhook(input.rawBody);

      const idempotency = await deps.idempotency.registerIfFirstSeen({
        provider: 'mercado_pago',
        providerEventId: parsedWebhook.providerEventId,
        payloadHash: await buildPayloadHash(input.rawBody)
      });

      if (!idempotency.shouldProcess) {
        if (isLikelyCryptographicSignature(signatureHeader)) {
          deps.logger.warn('Mercado Pago webhook replay detected for signed event', {
            provider: 'mercado_pago',
            requestId,
            dedupeKey: idempotency.dedupeKey,
            reason: 'replay_detected'
          });

          return {
            status: 401,
            error: {
              code: 'REPLAY_DETECTED',
              message: 'Webhook replay detected for duplicate signed event.'
            }
          };
        }

        return {
          status: 200,
          data: {
            accepted: true,
            decision: 'IGNORE_DUPLICATE',
            dedupeKey: idempotency.dedupeKey
          }
        };
      }

      const reconciledPayment = await deps.paymentsApiAdapter.getPaymentById({
        paymentId: parsedWebhook.paymentId
      });

      await deps.stateTransitions.applyPaymentTransition({
        provider: 'mercado_pago',
        paymentId: reconciledPayment.paymentId,
        externalReference: reconciledPayment.externalReference,
        reconciledStatus: reconciledPayment.status
      });

      return {
        status: 202,
        data: {
          accepted: true,
          decision: 'PROCESS',
          dedupeKey: idempotency.dedupeKey,
          reconciledStatus: reconciledPayment.status
        }
      };
    }
  };
}
