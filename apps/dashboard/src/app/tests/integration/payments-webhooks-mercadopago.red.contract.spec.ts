import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MERCADO_PAGO_SKELETON_V1 } from '../fixtures/payments/mercadopago-skeleton-v1.fixture';

type PaymentProvider = 'mercado_pago' | 'stripe';

type WebhookNormalizedEvent = {
  provider: PaymentProvider;
  providerEventId: string;
  providerPaymentId: string;
  eventType: 'payment.updated';
  status: 'approved' | 'pending' | 'rejected' | 'cancelled';
  externalReference: string;
  occurredAtIso: string;
  amount: {
    currency: 'ARS';
    totalAmountCents: number;
  };
};

type MercadoPagoWebhookResponse = {
  status: 202 | 200 | 401 | 422;
  data?: {
    accepted: boolean;
    decision: 'PROCESS' | 'IGNORE_DUPLICATE';
    dedupeKey: string;
    normalizedEvent?: WebhookNormalizedEvent;
  };
  error?: {
    code: 'INVALID_SIGNATURE' | 'INVALID_PAYLOAD' | 'REPLAY_DETECTED';
    message: string;
  };
};

type MercadoPagoWebhookApiModule = {
  handleMercadoPagoWebhook: (input: {
    headers: Record<string, string>;
    rawBody: string;
    nowIso: string;
  }) => Promise<MercadoPagoWebhookResponse>;
};

const ROOT = process.cwd();
const REPO_ROOT = fs.existsSync(path.join(ROOT, 'supabase')) ? ROOT : path.resolve(ROOT, '..');
const SUPABASE_MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

function readSqlCorpus(): string {
  if (!fs.existsSync(SUPABASE_MIGRATIONS_DIR)) {
    return '';
  }

  return fs
    .readdirSync(SUPABASE_MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .map((entry) => fs.readFileSync(path.join(SUPABASE_MIGRATIONS_DIR, entry), 'utf8'))
    .join('\n\n');
}

async function loadMercadoPagoWebhookApi(): Promise<MercadoPagoWebhookApiModule> {
  try {
    const mod = await import('../../core/payments/webhooks/mercadopago-webhook.api');
    return mod as MercadoPagoWebhookApiModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/mercadopago-webhook.api.ts exporting handleMercadoPagoWebhook() for POST /api/payments/webhooks/mercadopago with signature validation, event normalization and idempotent dedupe.'
    );
  }
}

describe('POST /api/payments/webhooks/mercadopago RED contract', () => {
  it('requires SQL persistence with webhook dedupe uniqueness and signature evidence columns', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus.length, 'Missing SQL migrations in /supabase/migrations for Mercado Pago webhooks').toBeGreaterThan(0);
    expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_webhook_events\b/i);
    expect(sqlCorpus).toMatch(
      /unique\s*\(\s*provider\s*,\s*provider_event_id\s*\)|constraint\s+\w+\s+unique\s*\(\s*provider\s*,\s*provider_event_id\s*\)/i
    );
    expect(sqlCorpus).toMatch(/signature_(?:valid|validated|is_valid)\s+boolean/i);
    expect(sqlCorpus).toMatch(/payload_hash\s+text\s+not\s+null/i);
  });

  it('rejects invalid signatures deterministically', async () => {
    const api = await loadMercadoPagoWebhookApi();

    const response = await api.handleMercadoPagoWebhook({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.invalidSignatureHeaders,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(response).toEqual({
      status: 401,
      error: {
        code: 'INVALID_SIGNATURE',
        message: expect.stringMatching(/signature|invalid/i)
      }
    });
  });

  it('normalizes approved payment event and rejects exact signed replays fail-closed', async () => {
    const api = await loadMercadoPagoWebhookApi();

    const first = await api.handleMercadoPagoWebhook({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: MERCADO_PAGO_SKELETON_V1.webhook.nowIso
    });

    expect(first).toEqual({
      status: 202,
      data: {
        accepted: true,
        decision: 'PROCESS',
        dedupeKey: 'mercado_pago:mp_evt_0001',
        normalizedEvent: {
          provider: 'mercado_pago',
          providerEventId: 'mp_evt_0001',
          providerPaymentId: 'mp_pay_0001',
          eventType: 'payment.updated',
          status: 'approved',
          externalReference: 'ext_biz_mp_qa_001_medium_001',
          occurredAtIso: '2026-04-21T09:59:58.000Z',
          amount: {
            currency: 'ARS',
            totalAmountCents: 159900
          }
        }
      }
    });

    const replay = await api.handleMercadoPagoWebhook({
      headers: MERCADO_PAGO_SKELETON_V1.webhook.headers,
      rawBody: MERCADO_PAGO_SKELETON_V1.webhook.rawBody,
      nowIso: '2026-04-21T10:00:06.000Z'
    });

    expect(replay).toEqual({
      status: 401,
      error: {
        code: 'REPLAY_DETECTED',
        message: expect.stringMatching(/replay|duplicate/i)
      }
    });
  });
});
