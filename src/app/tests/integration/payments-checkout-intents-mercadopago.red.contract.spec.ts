import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MERCADO_PAGO_SKELETON_V1 } from '../fixtures/payments/mercadopago-skeleton-v1.fixture';

type PaymentProvider = 'mercado_pago' | 'stripe';
type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type CheckoutIntentRequest = {
  businessId: string;
  planCode: PlanCode;
  payer: {
    email: string;
    fullName: string;
    nationalId: string;
  };
  amount: {
    currency: 'ARS';
    unitAmountCents: number;
    quantity: number;
    totalAmountCents: number;
  };
  callbackUrls: {
    successUrl: string;
    failureUrl: string;
    pendingUrl: string;
  };
  idempotencyKey: string;
  provider: PaymentProvider;
  nowIso: string;
};

type CheckoutIntentResponse = {
  status: 201 | 409 | 422;
  data?: {
    checkoutIntentId: string;
    provider: PaymentProvider;
    checkoutUrl: string;
    externalReference: string;
    status: 'pending';
    expiresAtIso: string;
    amount: {
      currency: 'ARS';
      unitAmountCents: number;
      totalAmountCents: number;
    };
  };
  error?: {
    code: 'DUPLICATE_IDEMPOTENCY_KEY' | 'VALIDATION_ERROR';
    message: string;
  };
};

type CheckoutIntentsApiModule = {
  createCheckoutIntent: (input: CheckoutIntentRequest) => Promise<CheckoutIntentResponse>;
};

const ROOT = process.cwd();
const SUPABASE_MIGRATIONS_DIR = path.join(ROOT, 'supabase', 'migrations');

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

async function loadCheckoutIntentsApi(): Promise<CheckoutIntentsApiModule> {
  try {
    const mod = await import('../../core/payments/checkout-intents/checkout-intents.api');
    return mod as CheckoutIntentsApiModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/checkout-intents/checkout-intents.api.ts exporting createCheckoutIntent() for POST /api/payments/checkout-intents with Mercado Pago endpoint and provider-agnostic domain contract.'
    );
  }
}

describe('POST /api/payments/checkout-intents RED contract (Mercado Pago endpoint, provider-agnostic domain)', () => {
  it('requires SQL persistence for checkout intents with deterministic idempotency uniqueness', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus.length, 'Missing SQL migrations in /supabase/migrations for checkout intents').toBeGreaterThan(0);
    expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_checkout_intents\b/i);
    expect(sqlCorpus).toMatch(
      /unique\s*\(\s*provider\s*,\s*idempotency_key\s*\)|constraint\s+\w+\s+unique\s*\(\s*provider\s*,\s*idempotency_key\s*\)/i
    );
    expect(sqlCorpus).toMatch(
      /unique\s*\(\s*provider\s*,\s*external_reference\s*\)|constraint\s+\w+\s+unique\s*\(\s*provider\s*,\s*external_reference\s*\)/i
    );
  });

  it('defines deterministic checkout-intent contract shape for Mercado Pago while preserving provider-agnostic fields', async () => {
    const api = await loadCheckoutIntentsApi();

    const response = await api.createCheckoutIntent(MERCADO_PAGO_SKELETON_V1.checkoutIntentRequest);

    expect(response).toEqual({
      status: 201,
      data: {
        checkoutIntentId: expect.any(String),
        provider: 'mercado_pago',
        checkoutUrl: expect.stringMatching(/^https:\/\//),
        externalReference: 'ext_biz_mp_qa_001_medium_001',
        status: 'pending',
        expiresAtIso: '2026-04-21T10:30:00.000Z',
        amount: {
          currency: 'ARS',
          unitAmountCents: 159900,
          totalAmountCents: 159900
        }
      }
    });
  });
});
