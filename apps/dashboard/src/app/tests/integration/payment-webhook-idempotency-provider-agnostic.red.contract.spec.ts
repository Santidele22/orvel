import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type PaymentProvider = 'mercado_pago' | 'stripe';

type ProcessingDecision = {
  shouldProcess: boolean;
  reason: 'FIRST_SEEN' | 'DUPLICATE_EVENT' | 'PAYLOAD_CHANGED_REPLAY';
  idempotencyKey: string;
};

type WebhookIdempotencyModule = {
  buildProviderAgnosticIdempotencyKey: (input: { provider: PaymentProvider; providerEventId: string }) => string;
  decideWebhookProcessing: (input: {
    provider: PaymentProvider;
    providerEventId: string;
    incomingPayloadHash: string;
    existingPayloadHash: string | null;
  }) => ProcessingDecision;
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

async function loadWebhookIdempotencyModule(): Promise<WebhookIdempotencyModule> {
  try {
    const mod = await import('../../core/payments/webhooks/payment-webhook-idempotency');
    return mod as WebhookIdempotencyModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/payment-webhook-idempotency.ts exporting buildProviderAgnosticIdempotencyKey() and decideWebhookProcessing() for Mercado Pago first, provider-agnostic by design.'
    );
  }
}

describe('Payment webhook idempotency RED contract (provider-agnostic skeleton)', () => {
  it('requires SQL persistence contract with unique(provider, provider_event_id)', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus.length, 'Missing SQL migrations in /supabase/migrations for payment webhook idempotency').toBeGreaterThan(0);
    expect(sqlCorpus).toMatch(
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_webhook_events\b/i
    );
    expect(sqlCorpus).toMatch(
      /unique\s*\(\s*provider\s*,\s*provider_event_id\s*\)|constraint\s+\w+\s+unique\s*\(\s*provider\s*,\s*provider_event_id\s*\)/i
    );
  });

  it('normalizes idempotency key and duplicate decisions across providers', async () => {
    const webhook = await loadWebhookIdempotencyModule();

    expect(
      webhook.buildProviderAgnosticIdempotencyKey({ provider: 'mercado_pago', providerEventId: '123' })
    ).toBe('mercado_pago:123');
    expect(webhook.buildProviderAgnosticIdempotencyKey({ provider: 'stripe', providerEventId: 'evt_001' })).toBe(
      'stripe:evt_001'
    );

    expect(
      webhook.decideWebhookProcessing({
        provider: 'mercado_pago',
        providerEventId: '123',
        incomingPayloadHash: 'hash_A',
        existingPayloadHash: null
      })
    ).toEqual({
      shouldProcess: true,
      reason: 'FIRST_SEEN',
      idempotencyKey: 'mercado_pago:123'
    });

    expect(
      webhook.decideWebhookProcessing({
        provider: 'mercado_pago',
        providerEventId: '123',
        incomingPayloadHash: 'hash_A',
        existingPayloadHash: 'hash_A'
      })
    ).toEqual({
      shouldProcess: false,
      reason: 'DUPLICATE_EVENT',
      idempotencyKey: 'mercado_pago:123'
    });
  });
});
