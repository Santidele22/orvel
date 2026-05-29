import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { MERCADO_PAGO_SKELETON_V1 } from '../fixtures/payments/mercadopago-skeleton-v1.fixture';

type PaymentProvider = 'mercado_pago' | 'stripe';
type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type PaymentStatusSyncResponse = {
  status: 200 | 202 | 404;
  data?: {
    provider: PaymentProvider;
    providerPaymentId: string;
    reconciledStatus: 'approved' | 'pending' | 'rejected' | 'cancelled';
    externalReference: string;
    entitlementUpdate: {
      applied: boolean;
      reason: 'APPLIED' | 'ALREADY_APPLIED' | 'PAYMENT_NOT_APPROVED';
      idempotencyKey: string;
      planCode?: PlanCode;
    };
  };
  error?: {
    code: 'PAYMENT_NOT_FOUND';
    message: string;
  };
};

type PaymentStatusSyncApiModule = {
  syncPaymentStatus: (input: {
    businessId: string;
    provider: PaymentProvider;
    providerPaymentId: string;
    externalReference: string;
    expectedPlanCode: PlanCode;
    nowIso: string;
  }) => Promise<PaymentStatusSyncResponse>;
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

async function loadPaymentStatusSyncApi(): Promise<PaymentStatusSyncApiModule> {
  try {
    const mod = await import('../../core/payments/status-sync/payment-status-sync.api');
    return mod as PaymentStatusSyncApiModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/status-sync/payment-status-sync.api.ts exporting syncPaymentStatus() for POST /api/payments/status-sync with provider-agnostic reconciliation and single entitlement update guarantees.'
    );
  }
}

describe('POST /api/payments/status-sync RED contract (reconciliation + single entitlement update)', () => {
  it('requires SQL reconciliation ledger and one-time entitlement application uniqueness', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus.length, 'Missing SQL migrations in /supabase/migrations for payment status sync').toBeGreaterThan(0);
    expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_status_reconciliation\b/i);
    expect(sqlCorpus).toMatch(
      /unique\s*\(\s*provider\s*,\s*provider_payment_id\s*\)|constraint\s+\w+\s+unique\s*\(\s*provider\s*,\s*provider_payment_id\s*\)/i
    );
    expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?entitlement_update_ledger\b/i);
    expect(sqlCorpus).toMatch(
      /unique\s*\(\s*entitlement_idempotency_key\s*\)|constraint\s+\w+\s+unique\s*\(\s*entitlement_idempotency_key\s*\)/i
    );
  });

  it('reconciles approved payment and applies entitlement exactly once', async () => {
    const api = await loadPaymentStatusSyncApi();

    const first = await api.syncPaymentStatus(MERCADO_PAGO_SKELETON_V1.statusSyncRequest);

    expect(first).toEqual({
      status: 200,
      data: {
        provider: 'mercado_pago',
        providerPaymentId: 'mp_pay_0001',
        reconciledStatus: 'approved',
        externalReference: 'ext_biz_mp_qa_001_medium_001',
        entitlementUpdate: {
          applied: true,
          reason: 'APPLIED',
          idempotencyKey: 'entitlement:mercado_pago:mp_pay_0001:MEDIUM',
          planCode: 'MEDIUM'
        }
      }
    });

    const replay = await api.syncPaymentStatus({
      ...MERCADO_PAGO_SKELETON_V1.statusSyncRequest,
      nowIso: '2026-04-21T10:00:20.000Z'
    });

    expect(replay).toEqual({
      status: 200,
      data: {
        provider: 'mercado_pago',
        providerPaymentId: 'mp_pay_0001',
        reconciledStatus: 'approved',
        externalReference: 'ext_biz_mp_qa_001_medium_001',
        entitlementUpdate: {
          applied: false,
          reason: 'ALREADY_APPLIED',
          idempotencyKey: 'entitlement:mercado_pago:mp_pay_0001:MEDIUM',
          planCode: 'MEDIUM'
        }
      }
    });
  });
});
