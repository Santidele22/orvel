import { beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'paused'
  | 'canceled'
  | 'expired'
  | 'scheduled_change';

type PlanCode = 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';

type SubscriptionSnapshot = {
  businessId: string;
  tenantId: string;
  subscriptionId: string;
  planCode: PlanCode;
  status: SubscriptionStatus;
  provider: 'mercado_pago';
  providerSubscriptionId: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  version: number;
};

type SubscriptionEvent = {
  provider: 'mercado_pago';
  providerEventId: string;
  providerSubscriptionId: string;
  eventType:
    | 'subscription.authorized'
    | 'subscription.payment_approved'
    | 'subscription.payment_rejected'
    | 'subscription.cancelled'
    | 'subscription.paused'
    | 'subscription.plan_changed';
  occurredAtIso: string;
  payloadHash: string;
  planCode?: PlanCode;
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
};

type StateMachineDecision =
  | {
      accepted: true;
      action: 'ACTIVATE' | 'RENEW' | 'MARK_PAST_DUE' | 'CANCEL_NOW' | 'SCHEDULE_CANCEL' | 'PAUSE' | 'SCHEDULE_PLAN_CHANGE' | 'APPLY_PLAN_CHANGE';
      next: SubscriptionSnapshot;
    }
  | {
      accepted: false;
      action: 'IGNORE_DUPLICATE' | 'IGNORE_OUT_OF_ORDER' | 'REJECT_INVALID_TRANSITION';
      reason: string;
      current: SubscriptionSnapshot;
    };

type SubscriptionStateMachineModule = {
  reduceSubscriptionEvent: (input: {
    current: SubscriptionSnapshot;
    event: SubscriptionEvent;
    nowIso: string;
  }) => Promise<StateMachineDecision>;
  cancelSubscription: (input: {
    current: SubscriptionSnapshot;
    mode: 'immediate' | 'end_of_period';
    requestedAtIso: string;
  }) => Promise<StateMachineDecision>;
  changeSubscriptionPlan: (input: {
    current: SubscriptionSnapshot;
    targetPlanCode: Exclude<PlanCode, 'FREE'>;
    effective: 'immediate' | 'next_period';
    requestedAtIso: string;
  }) => Promise<StateMachineDecision>;
};

type WebhookResponse = {
  status: 200 | 202 | 400 | 401 | 409 | 422;
  data?: {
    accepted: boolean;
    decision:
      | 'PROCESS'
      | 'IGNORE_DUPLICATE'
      | 'IGNORE_OUT_OF_ORDER'
      | 'REJECT_REPLAY'
      | 'REJECT_PAYLOAD_CONFLICT';
    dedupeKey: string;
    replayWindowSeconds?: number;
    event?: SubscriptionEvent;
  };
  error?: {
    code: 'INVALID_SIGNATURE' | 'REPLAY_WINDOW_EXCEEDED' | 'PAYLOAD_CONFLICT' | 'INVALID_PAYLOAD';
    message: string;
  };
};

type SubscriptionWebhookModule = {
  configureMercadoPagoSubscriptionWebhookPorts: (ports: {
    ledger: {
      reserve(record: {
        provider: 'mercado_pago';
        providerEventId: string;
        requestId: string;
        signatureTimestamp: number;
        signatureDigest: string;
        resourceId: string;
        action: string;
        payloadHash: string;
      }): Promise<'reserved' | 'duplicate' | 'payload_conflict'>;
    } | null;
    verifier: ((input: { signature: { ts: number; v1: string }; rawBody: string; headers: Record<string, string> }) => Promise<boolean>) | null;
  }) => void;
  handleMercadoPagoSubscriptionWebhook: (input: {
    headers: Record<string, string>;
    rawBody: string;
    nowIso: string;
  }) => Promise<WebhookResponse>;
};

type EntitlementsModule = {
  configureEntitlementsRepository: (repository: {
    getActiveSnapshot(input: { businessId: string; tenantId: string }): Promise<{
      businessId: string;
      tenantId: string;
      subscriptionStatus: Extract<SubscriptionStatus, 'active' | 'trialing'>;
      planCode: PlanCode;
      limits: { maxLocales: number; maxRubros: number; aiCreditsMonthly: number };
      source: 'subscription_state_machine';
    }>;
  } | null) => void;
  getEntitlementsSnapshot: (input: { businessId: string; tenantId: string }) => Promise<{
    businessId: string;
    tenantId: string;
    subscriptionStatus: Extract<SubscriptionStatus, 'active' | 'trialing'>;
    planCode: PlanCode;
    limits: { maxLocales: number; maxRubros: number; aiCreditsMonthly: number };
    source: 'subscription_state_machine';
  }>;
  assertEntitlement: (input: {
    businessId: string;
    tenantId: string;
    metric: 'maxLocales' | 'maxRubros' | 'aiCreditsMonthly';
    requestedUnits: number;
  }) => Promise<{ allowed: true; reason: 'OK' } | { allowed: false; reason: 'SUBSCRIPTION_NOT_ACTIVE' | 'ENTITLEMENT_LIMIT_EXCEEDED' }>;
};

type ReconciliationModule = {
  configureReconciliationRepository: (repository: {
    runDryRun(input: { tenantId: string; nowIso: string }): Promise<{
      scanned: number;
      driftCount: number;
      actions: Array<{
        businessId: string;
        providerSubscriptionId: string;
        drift: 'LOCAL_ACTIVE_REMOTE_CANCELLED' | 'LOCAL_PAST_DUE_REMOTE_AUTHORIZED' | 'PERIOD_MISMATCH' | 'PLAN_MISMATCH';
        recommendedAction: 'CANCEL_LOCALLY' | 'REACTIVATE_LOCALLY' | 'SYNC_PERIOD' | 'SYNC_PLAN' | 'MANUAL_REVIEW';
      }>;
    }>;
  } | null) => void;
  reconcileMercadoPagoSubscriptions: (input: { tenantId: string; dryRun: true; nowIso: string }) => Promise<{
    scanned: number;
    driftCount: number;
    actions: Array<{
      businessId: string;
      providerSubscriptionId: string;
      drift: 'LOCAL_ACTIVE_REMOTE_CANCELLED' | 'LOCAL_PAST_DUE_REMOTE_AUTHORIZED' | 'PERIOD_MISMATCH' | 'PLAN_MISMATCH';
      recommendedAction: 'CANCEL_LOCALLY' | 'REACTIVATE_LOCALLY' | 'SYNC_PERIOD' | 'SYNC_PLAN' | 'MANUAL_REVIEW';
    }>;
  }>;
};

const ROOT = process.cwd();
const REPO_ROOT = fs.existsSync(path.join(ROOT, 'supabase')) ? ROOT : path.resolve(ROOT, '..');
const SUPABASE_MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

const RUN_ID = crypto.randomUUID();
const ACTIVE_BUSINESS_ID = `biz_${RUN_ID}`;
const ACTIVE_TENANT_ID = `tenant_${RUN_ID}`;
const PAST_DUE_BUSINESS_ID = `biz_past_due_${RUN_ID}`;
const OTHER_TENANT_ID = `tenant_other_${RUN_ID}`;
const PROVIDER_SUBSCRIPTION_ID = `mp_preapproval_${RUN_ID}`;
const PROVIDER_EVENT_ID = `mp_evt_renewal_${RUN_ID}`;
const WEBHOOK_TS = Math.floor(new Date('2026-06-01T00:00:00.000Z').getTime() / 1000);

const ACTIVE_SUBSCRIPTION: SubscriptionSnapshot = {
  businessId: ACTIVE_BUSINESS_ID,
  tenantId: ACTIVE_TENANT_ID,
  subscriptionId: `sub_local_${RUN_ID}`,
  planCode: 'MEDIUM',
  status: 'active',
  provider: 'mercado_pago',
  providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
  currentPeriodStart: '2026-05-01T00:00:00.000Z',
  currentPeriodEnd: '2026-06-01T00:00:00.000Z',
  cancelAtPeriodEnd: false,
  version: 7
};

const VALID_WEBHOOK_HEADERS = {
  'x-signature': `ts=${WEBHOOK_TS},v1=dynamic-test-signature`,
  'x-request-id': `req_${RUN_ID}`
};

const WEBHOOK_BODY_RENEWAL_APPROVED = JSON.stringify({
  id: PROVIDER_EVENT_ID,
  type: 'subscription_preapproval',
  action: 'subscription.payment_approved',
  date_created: '2026-06-01T00:00:02.000Z',
  data: { id: PROVIDER_SUBSCRIPTION_ID },
  // Legacy webhook compatibility fixture: canonical code emits subscription/preapproval sessions.
  external_reference: `checkout-session:${RUN_ID}`,
  preapproval_plan_id: 'mp_plan_medium_monthly',
  status: 'authorized',
  next_payment_date: '2026-07-01T00:00:00.000Z'
});

function readSqlCorpus(): string {
  expect(fs.existsSync(SUPABASE_MIGRATIONS_DIR), `Missing migrations directory: ${SUPABASE_MIGRATIONS_DIR}`).toBe(true);

  return fs
    .readdirSync(SUPABASE_MIGRATIONS_DIR)
    .filter((entry) => entry.endsWith('.sql'))
    .sort()
    .map((entry) => fs.readFileSync(path.join(SUPABASE_MIGRATIONS_DIR, entry), 'utf8'))
    .join('\n\n');
}

async function loadStateMachine(): Promise<SubscriptionStateMachineModule> {
  try {
    return (await import('../../core/billing/subscriptions/subscription-state-machine.api')) as SubscriptionStateMachineModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add core/billing/subscriptions/subscription-state-machine.api.ts exporting reduceSubscriptionEvent(), cancelSubscription(), and changeSubscriptionPlan() with deterministic Orvel billing transitions.'
    );
  }
}

async function loadSubscriptionWebhook(): Promise<SubscriptionWebhookModule> {
  try {
    return (await import('../../core/payments/webhooks/mercadopago-subscription-webhook.api')) as SubscriptionWebhookModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add core/payments/webhooks/mercadopago-subscription-webhook.api.ts exporting handleMercadoPagoSubscriptionWebhook() with official signature validation, replay protection, idempotency, ordering, and conflict handling.'
    );
  }
}

async function loadEntitlements(): Promise<EntitlementsModule> {
  try {
    return (await import('../../core/billing/subscriptions/entitlements.api')) as EntitlementsModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add core/billing/subscriptions/entitlements.api.ts exporting getEntitlementsSnapshot() and assertEntitlement() backed by subscription state + tenant-scoped server truth.'
    );
  }
}

async function loadReconciliation(): Promise<ReconciliationModule> {
  try {
    return (await import('../../core/billing/subscriptions/reconciliation.api')) as ReconciliationModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add core/billing/subscriptions/reconciliation.api.ts exporting reconcileMercadoPagoSubscriptions() for dry-run drift detection before corrective jobs.'
    );
  }
}

beforeEach(async () => {
  const webhook = await loadSubscriptionWebhook();
  const ledger = new Map<string, string>();
  webhook.configureMercadoPagoSubscriptionWebhookPorts({
    verifier: async ({ signature }) => signature.v1 === 'dynamic-test-signature',
    ledger: {
      async reserve(record) {
        expect(record.requestId).toMatch(/^req_/);
        expect(record.signatureTimestamp).toBeGreaterThan(0);
        expect(record.signatureDigest).toBeTruthy();
        expect(record.resourceId).toBe(PROVIDER_SUBSCRIPTION_ID);
        expect(record.action).toBe('subscription.payment_approved');

        const key = `${record.provider}:${record.providerEventId}`;
        const existing = ledger.get(key);
        if (existing === record.payloadHash) return 'duplicate';
        if (existing) return 'payload_conflict';
        ledger.set(key, record.payloadHash);
        return 'reserved';
      }
    }
  });

  const entitlements = await loadEntitlements();
  entitlements.configureEntitlementsRepository({
    async getActiveSnapshot(input) {
      if (input.businessId === ACTIVE_BUSINESS_ID && input.tenantId === ACTIVE_TENANT_ID) {
        return {
          businessId: ACTIVE_BUSINESS_ID,
          tenantId: ACTIVE_TENANT_ID,
          subscriptionStatus: 'active',
          planCode: 'MEDIUM',
          limits: { maxLocales: 3, maxRubros: 3, aiCreditsMonthly: 500 },
          source: 'subscription_state_machine'
        };
      }

      if (input.businessId === PAST_DUE_BUSINESS_ID && input.tenantId === ACTIVE_TENANT_ID) {
        throw new Error('SUBSCRIPTION_NOT_ACTIVE');
      }

      throw new Error('Subscription tenant scope not found or forbidden by RLS.');
    }
  });

  const reconciliation = await loadReconciliation();
  reconciliation.configureReconciliationRepository({
    async runDryRun(input) {
      expect(input.tenantId).toBe(ACTIVE_TENANT_ID);
      return {
        scanned: 2,
        driftCount: 1,
        actions: [
          {
            businessId: ACTIVE_BUSINESS_ID,
            providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
            drift: 'LOCAL_ACTIVE_REMOTE_CANCELLED',
            recommendedAction: 'CANCEL_LOCALLY'
          }
        ]
      };
    }
  });
});

describe('Orvel billing remediation RED contracts', () => {
  describe('database contracts, tenant isolation and RLS', () => {
    it('requires durable subscription, webhook ledger, transition audit and reconciliation schema', () => {
      const sqlCorpus = readSqlCorpus();

      const requiredPatterns: Array<[string, RegExp]> = [
        ['business_subscriptions table', /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?business_subscriptions\b/i],
        ['subscription_events table', /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?subscription_events\b/i],
        ['payment_webhook_events table', /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_webhook_events\b/i],
        ['billing_reconciliation_runs table', /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?billing_reconciliation_runs\b/i],
        ['provider subscription uniqueness', /unique\s*\(\s*provider\s*,\s*provider_subscription_id\s*\)/i],
        ['webhook event idempotency uniqueness', /unique\s*\(\s*provider\s*,\s*provider_event_id\s*\)/i],
        ['payload conflict hash column', /payload_hash\s+text\s+not\s+null/i],
        ['subscription version for optimistic locking', /version\s+integer\s+not\s+null/i]
      ];

      for (const [name, pattern] of requiredPatterns) {
        expect(sqlCorpus, `Missing DB contract: ${name}`).toMatch(pattern);
      }
    });

    it('requires RLS enabled and tenant-scoped policies for billing tables', () => {
      const sqlCorpus = readSqlCorpus();
      const billingTables = ['business_subscriptions', 'subscription_events', 'payment_webhook_events', 'billing_reconciliation_runs'];

      for (const table of billingTables) {
        expect(sqlCorpus, `Missing RLS enablement for ${table}`).toMatch(
          new RegExp(`alter\\s+table\\s+(?:public\\.)?${table}\\s+enable\\s+row\\s+level\\s+security`, 'i')
        );
        expect(sqlCorpus, `Missing tenant/business scoped policy for ${table}`).toMatch(
          new RegExp(`create\\s+policy[\\s\\S]+on\\s+(?:public\\.)?${table}[\\s\\S]+(?:tenant_id|business_id)[\\s\\S]+auth\\.uid\\s*\\(\\s*\\)`, 'i')
        );
      }
    });
  });

  describe('subscription state machine', () => {
    it('renews active subscriptions only once and advances the billing period monotonically', async () => {
      const stateMachine = await loadStateMachine();

      const decision = await stateMachine.reduceSubscriptionEvent({
        current: ACTIVE_SUBSCRIPTION,
        nowIso: '2026-06-01T00:00:05.000Z',
        event: {
          provider: 'mercado_pago',
          providerEventId: PROVIDER_EVENT_ID,
          providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
          eventType: 'subscription.payment_approved',
          occurredAtIso: '2026-06-01T00:00:02.000Z',
          payloadHash: 'sha256:renewal-approved-001',
          planCode: 'MEDIUM',
          currentPeriodStart: '2026-06-01T00:00:00.000Z',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z'
        }
      });

      expect(decision).toEqual({
        accepted: true,
        action: 'RENEW',
        next: {
          ...ACTIVE_SUBSCRIPTION,
          currentPeriodStart: '2026-06-01T00:00:00.000Z',
          currentPeriodEnd: '2026-07-01T00:00:00.000Z',
          version: 8
        }
      });
    });

    it('marks renewal failures as past_due without granting active entitlements', async () => {
      const stateMachine = await loadStateMachine();

      const decision = await stateMachine.reduceSubscriptionEvent({
        current: ACTIVE_SUBSCRIPTION,
        nowIso: '2026-06-01T00:05:00.000Z',
        event: {
          provider: 'mercado_pago',
          providerEventId: 'mp_evt_sub_rejected_001',
          providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
          eventType: 'subscription.payment_rejected',
          occurredAtIso: '2026-06-01T00:04:00.000Z',
          payloadHash: 'sha256:renewal-rejected-001'
        }
      });

      expect(decision).toEqual({
        accepted: true,
        action: 'MARK_PAST_DUE',
        next: {
          ...ACTIVE_SUBSCRIPTION,
          status: 'past_due',
          version: 8
        }
      });
    });

    it('ignores out-of-order events older than the current billing period', async () => {
      const stateMachine = await loadStateMachine();

      const decision = await stateMachine.reduceSubscriptionEvent({
        current: ACTIVE_SUBSCRIPTION,
        nowIso: '2026-06-02T00:00:00.000Z',
        event: {
          provider: 'mercado_pago',
          providerEventId: 'mp_evt_sub_old_001',
          providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
          eventType: 'subscription.payment_rejected',
          occurredAtIso: '2026-04-30T23:59:59.000Z',
          payloadHash: 'sha256:old-rejected-001'
        }
      });

      expect(decision).toEqual({
        accepted: false,
        action: 'IGNORE_OUT_OF_ORDER',
        reason: expect.stringMatching(/older|out[- ]of[- ]order|period/i),
        current: ACTIVE_SUBSCRIPTION
      });
    });

    it('supports cancel immediate versus cancel at end of period', async () => {
      const stateMachine = await loadStateMachine();

      await expect(
        stateMachine.cancelSubscription({ current: ACTIVE_SUBSCRIPTION, mode: 'immediate', requestedAtIso: '2026-05-10T12:00:00.000Z' })
      ).resolves.toEqual({
        accepted: true,
        action: 'CANCEL_NOW',
        next: expect.objectContaining({ status: 'canceled', cancelAtPeriodEnd: false, version: 8 })
      });

      await expect(
        stateMachine.cancelSubscription({ current: ACTIVE_SUBSCRIPTION, mode: 'end_of_period', requestedAtIso: '2026-05-10T12:00:00.000Z' })
      ).resolves.toEqual({
        accepted: true,
        action: 'SCHEDULE_CANCEL',
        next: expect.objectContaining({ status: 'active', cancelAtPeriodEnd: true, currentPeriodEnd: '2026-06-01T00:00:00.000Z', version: 8 })
      });
    });

    it('applies upgrades immediately and schedules downgrades for next period', async () => {
      const stateMachine = await loadStateMachine();

      await expect(
        stateMachine.changeSubscriptionPlan({ current: ACTIVE_SUBSCRIPTION, targetPlanCode: 'PRO', effective: 'immediate', requestedAtIso: '2026-05-10T12:00:00.000Z' })
      ).resolves.toEqual({
        accepted: true,
        action: 'APPLY_PLAN_CHANGE',
        next: expect.objectContaining({ planCode: 'PRO', status: 'active', version: 8 })
      });

      await expect(
        stateMachine.changeSubscriptionPlan({ current: ACTIVE_SUBSCRIPTION, targetPlanCode: 'BASIC', effective: 'next_period', requestedAtIso: '2026-05-10T12:00:00.000Z' })
      ).resolves.toEqual({
        accepted: true,
        action: 'SCHEDULE_PLAN_CHANGE',
        next: expect.objectContaining({ planCode: 'MEDIUM', status: 'scheduled_change', currentPeriodEnd: '2026-06-01T00:00:00.000Z', version: 8 })
      });
    });
  });

  describe('Mercado Pago subscription webhooks', () => {
    it('rejects invalid signatures and timestamp replay attempts before mutating state', async () => {
      const webhook = await loadSubscriptionWebhook();

      await expect(
        webhook.handleMercadoPagoSubscriptionWebhook({
          headers: { ...VALID_WEBHOOK_HEADERS, 'x-signature': `ts=${WEBHOOK_TS},v1=invalid` },
          rawBody: WEBHOOK_BODY_RENEWAL_APPROVED,
          nowIso: '2026-06-01T00:00:03.000Z'
        })
      ).resolves.toEqual({
        status: 401,
        error: { code: 'INVALID_SIGNATURE', message: expect.stringMatching(/signature/i) }
      });

      await expect(
        webhook.handleMercadoPagoSubscriptionWebhook({
          headers: { ...VALID_WEBHOOK_HEADERS, 'x-signature': 'ts=1778090000,v1=dynamic-test-signature' },
          rawBody: WEBHOOK_BODY_RENEWAL_APPROVED,
          nowIso: '2026-06-01T03:00:00.000Z'
        })
      ).resolves.toEqual({
        status: 401,
        error: { code: 'REPLAY_WINDOW_EXCEEDED', message: expect.stringMatching(/replay|timestamp|window/i) }
      });
    });

    it('dedupes exact replays but rejects same provider event id with a different payload hash', async () => {
      const webhook = await loadSubscriptionWebhook();

      const first = await webhook.handleMercadoPagoSubscriptionWebhook({
        headers: VALID_WEBHOOK_HEADERS,
        rawBody: WEBHOOK_BODY_RENEWAL_APPROVED,
        nowIso: '2026-06-01T00:00:03.000Z'
      });

      expect(first).toEqual({
        status: 202,
        data: {
          accepted: true,
          decision: 'PROCESS',
          dedupeKey: `mercado_pago:${PROVIDER_EVENT_ID}`,
          replayWindowSeconds: expect.any(Number),
          event: expect.objectContaining({ providerEventId: PROVIDER_EVENT_ID, eventType: 'subscription.payment_approved' })
        }
      });

      await expect(
        webhook.handleMercadoPagoSubscriptionWebhook({
          headers: VALID_WEBHOOK_HEADERS,
          rawBody: WEBHOOK_BODY_RENEWAL_APPROVED,
          nowIso: '2026-06-01T00:00:04.000Z'
        })
      ).resolves.toEqual({
        status: 200,
        data: { accepted: true, decision: 'IGNORE_DUPLICATE', dedupeKey: `mercado_pago:${PROVIDER_EVENT_ID}` }
      });

      await expect(
        webhook.handleMercadoPagoSubscriptionWebhook({
          headers: VALID_WEBHOOK_HEADERS,
          rawBody: WEBHOOK_BODY_RENEWAL_APPROVED.replace('authorized', 'cancelled'),
          nowIso: '2026-06-01T00:00:05.000Z'
        })
      ).resolves.toEqual({
        status: 409,
        error: { code: 'PAYLOAD_CONFLICT', message: expect.stringMatching(/provider event|payload|hash/i) }
      });
    });
  });

  describe('entitlements, multi-tenant safety and reconciliation', () => {
    it('derives entitlements from active subscription server state and denies inactive subscriptions', async () => {
      const entitlements = await loadEntitlements();

      await expect(entitlements.getEntitlementsSnapshot({ businessId: ACTIVE_BUSINESS_ID, tenantId: ACTIVE_TENANT_ID })).resolves.toEqual({
        businessId: ACTIVE_BUSINESS_ID,
        tenantId: ACTIVE_TENANT_ID,
        subscriptionStatus: 'active',
        planCode: 'MEDIUM',
        limits: { maxLocales: 3, maxRubros: 3, aiCreditsMonthly: expect.any(Number) },
        source: 'subscription_state_machine'
      });

      await expect(
        entitlements.assertEntitlement({ businessId: PAST_DUE_BUSINESS_ID, tenantId: ACTIVE_TENANT_ID, metric: 'maxLocales', requestedUnits: 1 })
      ).resolves.toEqual({ allowed: false, reason: 'SUBSCRIPTION_NOT_ACTIVE' });
    });

    it('does not leak entitlements across tenants that share external provider identifiers', async () => {
      const entitlements = await loadEntitlements();

      await expect(entitlements.getEntitlementsSnapshot({ businessId: ACTIVE_BUSINESS_ID, tenantId: OTHER_TENANT_ID })).rejects.toThrow(
        /tenant|RLS|not found|forbidden/i
      );
    });

    it('reconciliation detects local/remote drift without mutating production data in dry-run mode', async () => {
      const reconciliation = await loadReconciliation();

      await expect(
        reconciliation.reconcileMercadoPagoSubscriptions({ tenantId: ACTIVE_TENANT_ID, dryRun: true, nowIso: '2026-06-02T03:00:00.000Z' })
      ).resolves.toEqual({
        scanned: expect.any(Number),
        driftCount: expect.any(Number),
        actions: expect.arrayContaining([
          {
            businessId: ACTIVE_BUSINESS_ID,
            providerSubscriptionId: PROVIDER_SUBSCRIPTION_ID,
            drift: expect.stringMatching(/LOCAL_ACTIVE_REMOTE_CANCELLED|LOCAL_PAST_DUE_REMOTE_AUTHORIZED|PERIOD_MISMATCH|PLAN_MISMATCH/),
            recommendedAction: expect.stringMatching(/CANCEL_LOCALLY|REACTIVATE_LOCALLY|SYNC_PERIOD|SYNC_PLAN|MANUAL_REVIEW/)
          }
        ])
      });
    });
  });
});
