import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled' | 'expired' | 'scheduled_change';
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
  | { accepted: true; next: SubscriptionSnapshot }
  | { accepted: false; reason: string; current: SubscriptionSnapshot };

type SubscriptionStateMachineModule = {
  reduceSubscriptionEvent: (input: {
    current: SubscriptionSnapshot;
    event: SubscriptionEvent;
    nowIso: string;
  }) => Promise<StateMachineDecision>;
};

const ROOT = process.cwd();
const REPO_ROOT = fs.existsSync(path.join(ROOT, 'supabase')) ? ROOT : path.resolve(ROOT, '..');
const MIGRATIONS_DIR = path.join(REPO_ROOT, 'supabase', 'migrations');

async function loadStateMachine(): Promise<SubscriptionStateMachineModule> {
  return (await import('../../core/billing/subscriptions/subscription-state-machine.api')) as SubscriptionStateMachineModule;
}

describe('High-risk QA gate: onboarding + billing', () => {
  it('validates Mercado Pago subscription lifecycle transitions (approved, pending/rejected, canceled)', async () => {
    const mod = await loadStateMachine();
    const base: SubscriptionSnapshot = {
      businessId: 'biz-qa',
      tenantId: 'tenant-qa',
      subscriptionId: 'sub-qa',
      planCode: 'MEDIUM',
      status: 'trialing',
      provider: 'mercado_pago',
      providerSubscriptionId: 'mp-preapproval-qa',
      currentPeriodStart: '2026-06-01T00:00:00.000Z',
      currentPeriodEnd: '2026-07-01T00:00:00.000Z',
      cancelAtPeriodEnd: false,
      version: 1
    };

    const approved = await mod.reduceSubscriptionEvent({
      current: base,
      event: {
        provider: 'mercado_pago',
        providerEventId: 'evt-approved',
        providerSubscriptionId: base.providerSubscriptionId,
        eventType: 'subscription.payment_approved',
        occurredAtIso: '2026-06-01T00:00:05.000Z',
        payloadHash: 'hash-approved',
        currentPeriodStart: '2026-06-01T00:00:00.000Z',
        currentPeriodEnd: '2026-07-01T00:00:00.000Z'
      },
      nowIso: '2026-06-01T00:00:05.000Z'
    });

    expect(approved.accepted).toBe(true);
    if (!approved.accepted) throw new Error('Expected approved event accepted');
    expect(approved.next.status).toBe('active');

    const pendingLike = await mod.reduceSubscriptionEvent({
      current: approved.next,
      event: {
        provider: 'mercado_pago',
        providerEventId: 'evt-rejected',
        providerSubscriptionId: base.providerSubscriptionId,
        eventType: 'subscription.payment_rejected',
        occurredAtIso: '2026-06-10T00:00:00.000Z',
        payloadHash: 'hash-rejected'
      },
      nowIso: '2026-06-10T00:00:00.000Z'
    });

    expect(pendingLike.accepted).toBe(true);
    if (!pendingLike.accepted) throw new Error('Expected rejected event accepted');
    expect(pendingLike.next.status).toBe('past_due');

    const canceled = await mod.reduceSubscriptionEvent({
      current: pendingLike.next,
      event: {
        provider: 'mercado_pago',
        providerEventId: 'evt-canceled',
        providerSubscriptionId: base.providerSubscriptionId,
        eventType: 'subscription.cancelled',
        occurredAtIso: '2026-06-20T00:00:00.000Z',
        payloadHash: 'hash-canceled'
      },
      nowIso: '2026-06-20T00:00:00.000Z'
    });

    expect(canceled.accepted).toBe(true);
    if (!canceled.accepted) throw new Error('Expected cancel event accepted');
    expect(canceled.next.status).toBe('canceled');
  });

  it('keeps migration equivalence concentrated in exactly 2 billing consolidation files', () => {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((entry) => entry.endsWith('.sql')).sort();
    const consolidated = files.filter(
      (entry) => entry === '20260501_consolidated_schema.sql' || entry === '20260506_consolidated_billing.sql'
    );

    expect(consolidated).toEqual([
      '20260501_consolidated_schema.sql',
      '20260506_consolidated_billing.sql'
    ]);

    const consolidatedSql = consolidated
      .map((entry) => fs.readFileSync(path.join(MIGRATIONS_DIR, entry), 'utf8'))
      .join('\n\n');

    expect(consolidatedSql).toMatch(/reserve_payment_webhook_event\s*\(/i);
    expect(consolidatedSql).toMatch(/mark_payment_webhook_event_state\s*\(/i);
    expect(consolidatedSql).toMatch(/apply_subscription_event_transition\s*\(/i);
    expect(consolidatedSql).toMatch(/reconcile_mercadopago_subscriptions_dry_run\s*\(/i);
    expect(consolidatedSql).toMatch(/grant\s+select\s*,\s*insert\s*,\s*update\s*,\s*delete\s+on\s+table\s+public\.payment_webhook_events\s+to\s+service_role/i);
  });

  it('enforces onboarding e2e sequence contract: plan -> account -> business types -> welcome -> login -> dashboard', () => {
    const authE2EPath = path.join(ROOT, 'src', 'app', 'tests', 'e2e', 'auth-flow.spec.ts');
    const authE2ESource = fs.existsSync(authE2EPath) ? fs.readFileSync(authE2EPath, 'utf8') : '';

    expect(authE2ESource).toMatch(/ONBOARDING_PLAN_KEY/);
    expect(authE2ESource).toMatch(/ONBOARDING_CREDENTIALS_KEY/);
    expect(authE2ESource).toMatch(/ONBOARDING_BUSINESS_TYPES_KEY/);
    expect(authE2ESource).toMatch(/welcome modal|welcome message|bienvenid/i);
    expect(authE2ESource).toMatch(/\/auth\/login/);
    expect(authE2ESource).toMatch(/\/dashboard\/inicio/);

    const planIndex = authE2ESource.indexOf('ONBOARDING_PLAN_KEY');
    const accountIndex = authE2ESource.indexOf('ONBOARDING_CREDENTIALS_KEY');
    const businessTypesIndex = authE2ESource.indexOf('ONBOARDING_BUSINESS_TYPES_KEY');
    const loginIndex = authE2ESource.indexOf('/auth/login');
    const dashboardIndex = authE2ESource.indexOf('/dashboard/inicio');

    expect(planIndex).toBeGreaterThanOrEqual(0);
    expect(accountIndex).toBeGreaterThan(planIndex);
    expect(businessTypesIndex).toBeGreaterThan(accountIndex);
    expect(loginIndex).toBeGreaterThan(businessTypesIndex);
    expect(dashboardIndex).toBeGreaterThan(loginIndex);
  });
});
