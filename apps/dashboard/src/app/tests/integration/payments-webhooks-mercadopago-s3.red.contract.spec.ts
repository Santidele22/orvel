import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type ServerRouteRegistrarModule = {
  registerMercadoPagoWebhookRoute: (deps: {
    registerRoute: (route: {
      method: 'POST';
      path: '/api/payments/webhooks/mercadopago';
      handler: (input: {
        headers: Record<string, string>;
        rawBody: string;
        nowIso: string;
      }) => Promise<{ status: number; body: unknown }>;
    }) => void;
    handleWebhook: (input: {
      headers: Record<string, string>;
      rawBody: string;
      nowIso: string;
    }) => Promise<{ status: number; body: unknown }>;
  }) => void;
};

type WebhookAuditTrailModule = {
  createWebhookAuditTrailRepository: (deps: {
    clock: () => string;
    persistence: {
      insertWebhookEvent: (input: {
        provider: 'mercado_pago';
        providerEventId: string;
        payloadHash: string;
        signatureValidated: boolean;
        receivedAtIso: string;
      }) => Promise<{ webhookEventId: string }>;
      insertPaymentStateTransition: (input: {
        webhookEventId: string;
        provider: 'mercado_pago';
        providerPaymentId: string;
        externalReference: string;
        fromStatus: 'pending' | 'approved' | 'rejected' | 'cancelled';
        toStatus: 'pending' | 'approved' | 'rejected' | 'cancelled';
        transitionedAtIso: string;
      }) => Promise<{ transitionId: string }>;
    };
  }) => {
    recordWebhookAuditTrail: (input: {
      providerEventId: string;
      payloadHash: string;
      signatureValidated: boolean;
      providerPaymentId: string;
      externalReference: string;
      fromStatus: 'pending' | 'approved' | 'rejected' | 'cancelled';
      toStatus: 'pending' | 'approved' | 'rejected' | 'cancelled';
    }) => Promise<{
      webhookEventId: string;
      transitionId: string;
    }>;
  };
};

type PaymentConfirmedBusinessSyncModule = {
  createPaymentConfirmedBusinessSync: (deps: {
    subscriptions: {
      upsertFromPayment: (input: {
        businessId: string;
        provider: 'mercado_pago';
        providerPaymentId: string;
        externalReference: string;
        planCode: 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
        status: 'active';
        nowIso: string;
      }) => Promise<{ applied: boolean; subscriptionId: string }>;
    };
    entitlements: {
      syncForBusiness: (input: {
        businessId: string;
        planCode: 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
        source: 'payment_webhook';
        sourceRef: string;
        nowIso: string;
      }) => Promise<{ synced: boolean; reason: 'APPLIED' | 'ALREADY_APPLIED' }>;
    };
  }) => {
    apply: (input: {
      businessId: string;
      provider: 'mercado_pago';
      providerPaymentId: string;
      externalReference: string;
      reconciledStatus: 'approved' | 'pending' | 'rejected' | 'cancelled';
      planCode: 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO';
      nowIso: string;
    }) => Promise<{
      status: 200 | 202;
      data: {
        applied: boolean;
        reason: 'SYNCED' | 'ALREADY_SYNCED' | 'PAYMENT_NOT_APPROVED';
      };
    }>;
  };
};

const ROOT = process.cwd();
const REPO_ROOT = fs.existsSync(path.join(ROOT, 'supabase')) ? ROOT : path.resolve(ROOT, '..');
const APP_ROUTES_PATH = path.join(ROOT, 'src', 'app', 'app.routes.ts');

function resolveSupabaseMigrationsDirs(): string[] {
  const candidates = [
    path.join(REPO_ROOT, 'supabase', 'migrations'),
    path.join(ROOT, 'supabase', 'migrations'),
    path.join(ROOT, '..', 'supabase', 'migrations')
  ];

  return candidates.filter((candidate, index) => candidates.indexOf(candidate) === index && fs.existsSync(candidate));
}

function readSqlCorpus(): string {
  const migrationsDirs = resolveSupabaseMigrationsDirs();

  if (migrationsDirs.length === 0) {
    return '';
  }

  return migrationsDirs
    .flatMap((migrationsDir) =>
      fs
        .readdirSync(migrationsDir)
        .filter((entry) => entry.endsWith('.sql'))
        .map((entry) => fs.readFileSync(path.join(migrationsDir, entry), 'utf8'))
    )
    .join('\n\n');
}

async function loadWebhookServerRouteRegistrar(): Promise<ServerRouteRegistrarModule> {
  try {
    const mod = await import('../../core/payments/webhooks/mercadopago-webhook-server.entrypoint');
    return mod as ServerRouteRegistrarModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/mercadopago-webhook-server.entrypoint.ts exporting registerMercadoPagoWebhookRoute() to wire POST /api/payments/webhooks/mercadopago in the server entrypoint.'
    );
  }
}

async function loadWebhookAuditTrailModule(): Promise<WebhookAuditTrailModule> {
  try {
    const mod = await import('../../core/payments/webhooks/mercadopago-webhook-audit-trail.repository');
    return mod as WebhookAuditTrailModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/mercadopago-webhook-audit-trail.repository.ts exporting createWebhookAuditTrailRepository() with event + state transition persistence.'
    );
  }
}

async function loadPaymentConfirmedBusinessSyncModule(): Promise<PaymentConfirmedBusinessSyncModule> {
  try {
    const mod = await import('../../core/payments/webhooks/payment-confirmed-business-sync.service');
    return mod as PaymentConfirmedBusinessSyncModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/webhooks/payment-confirmed-business-sync.service.ts exporting createPaymentConfirmedBusinessSync() to sync subscription + entitlements after approved payment.'
    );
  }
}

describe('Mercado Pago webhooks S3 RED contract (wiring + audit + business sync)', () => {
  it('keeps checkout return routes in app router and wires webhook endpoint in server entrypoint', async () => {
    const appRoutesSource = fs.readFileSync(APP_ROUTES_PATH, 'utf8');

    expect(appRoutesSource).toMatch(/path:\s*['"]payments\/return\/success['"]/);
    expect(appRoutesSource).toMatch(/path:\s*['"]payments\/return\/pending['"]/);
    expect(appRoutesSource).toMatch(/path:\s*['"]payments\/return\/failure['"]/);

    const serverEntrypoint = await loadWebhookServerRouteRegistrar();
    const registerRoute = vi.fn();
    const handleWebhook = vi.fn(async () => ({ status: 202, body: { accepted: true } }));

    serverEntrypoint.registerMercadoPagoWebhookRoute({
      registerRoute,
      handleWebhook
    });

    expect(registerRoute).toHaveBeenCalledWith({
      method: 'POST',
      path: '/api/payments/webhooks/mercadopago',
      handler: expect.any(Function)
    });
  });

  it('requires SQL audit trail persistence for webhook events and payment state transitions', () => {
    const sqlCorpus = readSqlCorpus();

    expect(sqlCorpus.length, 'Missing SQL migrations in /supabase/migrations for webhook S3 audit trail').toBeGreaterThan(0);
    expect(sqlCorpus).toMatch(/create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_webhook_events\b/i);
    expect(sqlCorpus).toMatch(/signature_(?:validated|is_valid|valid)\s+boolean/i);
    const hasLegacyStateTransitionsTable = /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?payment_state_transitions\b/i.test(
      sqlCorpus
    );
    const hasConsolidatedSubscriptionEventsTable =
      /create\s+table\s+(if\s+not\s+exists\s+)?(?:public\.)?subscription_events\b/i.test(sqlCorpus) &&
      /provider_event_id\s+text\s+not\s+null/i.test(sqlCorpus);

    expect(hasLegacyStateTransitionsTable || hasConsolidatedSubscriptionEventsTable).toBe(true);
  });

  it('persists both event and state transition atomically in the repository contract', async () => {
    const auditTrailModule = await loadWebhookAuditTrailModule();

    const insertWebhookEvent = vi.fn(async () => ({ webhookEventId: 'whevt_0001' }));
    const insertPaymentStateTransition = vi.fn(async () => ({ transitionId: 'tr_0001' }));

    const repository = auditTrailModule.createWebhookAuditTrailRepository({
      clock: () => '2026-04-21T10:00:15.000Z',
      persistence: {
        insertWebhookEvent,
        insertPaymentStateTransition
      }
    });

    const result = await repository.recordWebhookAuditTrail({
      providerEventId: 'mp_evt_0001',
      payloadHash: 'sha256_evt_0001',
      signatureValidated: true,
      providerPaymentId: 'mp_pay_0001',
      externalReference: 'ext_biz_mp_qa_001_medium_001',
      fromStatus: 'pending',
      toStatus: 'approved'
    });

    expect(insertWebhookEvent).toHaveBeenCalledWith({
      provider: 'mercado_pago',
      providerEventId: 'mp_evt_0001',
      payloadHash: 'sha256_evt_0001',
      signatureValidated: true,
      receivedAtIso: '2026-04-21T10:00:15.000Z'
    });

    expect(insertPaymentStateTransition).toHaveBeenCalledWith({
      webhookEventId: 'whevt_0001',
      provider: 'mercado_pago',
      providerPaymentId: 'mp_pay_0001',
      externalReference: 'ext_biz_mp_qa_001_medium_001',
      fromStatus: 'pending',
      toStatus: 'approved',
      transitionedAtIso: '2026-04-21T10:00:15.000Z'
    });

    const eventCallOrder = (insertWebhookEvent as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const transitionCallOrder = (insertPaymentStateTransition as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(eventCallOrder).toBeLessThan(transitionCallOrder);

    expect(result).toEqual({
      webhookEventId: 'whevt_0001',
      transitionId: 'tr_0001'
    });
  });

  it('syncs subscription + entitlements when payment is confirmed approved', async () => {
    const businessSyncModule = await loadPaymentConfirmedBusinessSyncModule();

    const upsertFromPayment = vi.fn(async () => ({ applied: true, subscriptionId: 'sub_0001' }));
    const syncForBusiness = vi.fn(async () => ({ synced: true, reason: 'APPLIED' as const }));

    const service = businessSyncModule.createPaymentConfirmedBusinessSync({
      subscriptions: { upsertFromPayment },
      entitlements: { syncForBusiness }
    });

    const result = await service.apply({
      businessId: 'biz_mp_qa_001',
      provider: 'mercado_pago',
      providerPaymentId: 'mp_pay_0001',
      externalReference: 'ext_biz_mp_qa_001_medium_001',
      reconciledStatus: 'approved',
      planCode: 'MEDIUM',
      nowIso: '2026-04-21T10:00:20.000Z'
    });

    expect(upsertFromPayment).toHaveBeenCalledWith({
      businessId: 'biz_mp_qa_001',
      provider: 'mercado_pago',
      providerPaymentId: 'mp_pay_0001',
      externalReference: 'ext_biz_mp_qa_001_medium_001',
      planCode: 'MEDIUM',
      status: 'active',
      nowIso: '2026-04-21T10:00:20.000Z'
    });

    expect(syncForBusiness).toHaveBeenCalledWith({
      businessId: 'biz_mp_qa_001',
      planCode: 'MEDIUM',
      source: 'payment_webhook',
      sourceRef: 'mercado_pago:mp_pay_0001',
      nowIso: '2026-04-21T10:00:20.000Z'
    });

    const subscriptionOrder = (upsertFromPayment as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    const entitlementOrder = (syncForBusiness as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
    expect(subscriptionOrder).toBeLessThan(entitlementOrder);

    expect(result).toEqual({
      status: 200,
      data: {
        applied: true,
        reason: 'SYNCED'
      }
    });
  });
});
