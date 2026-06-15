import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

type StructuredEventName = 'mp.webhook.signature_failed' | 'mp.webhook.processing_error';

type StructuredOperationalEvent = {
  eventName: StructuredEventName;
  occurredAtIso: string;
  correlationId: string;
  requestId: string;
  environment: 'development' | 'staging' | 'production' | 'test';
  reason?: string;
  stage?: string;
  metadata?: Record<string, unknown>;
};

type StructuredEventsModule = {
  buildMercadoPagoOperationalEvent: (input: {
    eventName: StructuredEventName;
    correlationId: string;
    requestId: string;
    environment: 'development' | 'staging' | 'production' | 'test';
    reason?: string;
    stage?: string;
    metadata?: Record<string, unknown>;
    occurredAtIso?: string;
  }) => StructuredOperationalEvent;
};

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

type MinimalOperationalAlert = {
  key: 'mp_webhook_signature_failures_spike' | 'mp_webhook_processing_errors_spike';
  enabled: boolean;
  severity: AlertSeverity;
  owner: string;
  runbookUrl: string;
};

type AlertsModule = {
  getMercadoPagoOperationalAlerts: () => MinimalOperationalAlert[];
};

type ProductionConfigGateModule = {
  evaluateMercadoPagoProductionConfigGate: (input: {
    environment: 'development' | 'staging' | 'production' | 'test';
    config: {
      webhookSecret?: string;
      accessToken?: string;
      webhookSecurityGuardrailEnabled?: boolean;
    };
  }) => {
    ok: boolean;
    errors: string[];
  };
};

const ROOT = process.cwd();
const ROLLBACK_CHECKLIST_RELATIVE = path.join(
  'docs',
  'runbooks',
  'mercadopago-webhook-rollback-quick-checklist.md'
);
const ROLLBACK_CHECKLIST_PATH = path.join(ROOT, ROLLBACK_CHECKLIST_RELATIVE);

async function loadStructuredEventsModule(): Promise<StructuredEventsModule> {
  try {
    const mod = await import('../../core/payments/observability/mercadopago-operational-events');
    return mod as StructuredEventsModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/observability/mercadopago-operational-events.ts exporting buildMercadoPagoOperationalEvent() for S5 structured operational events.'
    );
  }
}

async function loadAlertsModule(): Promise<AlertsModule> {
  try {
    const mod = await import('../../core/payments/observability/mercadopago-operational-alerts');
    return mod as AlertsModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/observability/mercadopago-operational-alerts.ts exporting getMercadoPagoOperationalAlerts() with minimal production alert contracts.'
    );
  }
}

async function loadProductionConfigGateModule(): Promise<ProductionConfigGateModule> {
  try {
    const mod = await import('../../core/payments/observability/mercadopago-production-config-gate');
    return mod as ProductionConfigGateModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/payments/observability/mercadopago-production-config-gate.ts exporting evaluateMercadoPagoProductionConfigGate() for go-live guardrails.'
    );
  }
}

function collectSensitiveKeyPaths(value: unknown, basePath = 'event'): string[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const entries = Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as const)
    : Object.entries(value as Record<string, unknown>);

  return entries.flatMap(([key, nested]) => {
    const currentPath = `${basePath}.${key}`;
    const hasSensitiveKey = /(secret|token|signature|authorization|password|rawBody|x-signature)/i.test(key);
    const nestedMatches = collectSensitiveKeyPaths(nested, currentPath);
    return hasSensitiveKey ? [currentPath, ...nestedMatches] : nestedMatches;
  });
}

describe('Mercado Pago S5-I1 RED contract (operational readiness)', () => {
  describe('1) structured events', () => {
    it('emits mp.webhook.signature_failed with safe fields only (correlation/request id, env, reason/stage)', async () => {
      const events = await loadStructuredEventsModule();

      const event = events.buildMercadoPagoOperationalEvent({
        eventName: 'mp.webhook.signature_failed',
        correlationId: 'corr_mp_s5_i1_001',
        requestId: 'req_mp_s5_i1_001',
        environment: 'production',
        reason: 'digest_mismatch',
        stage: 'signature_validation',
        metadata: {
          dedupeKey: 'mercado_pago:mp_evt_0001',
          provider: 'mercado_pago'
        }
      });

      expect(event).toEqual(
        expect.objectContaining({
          eventName: 'mp.webhook.signature_failed',
          correlationId: 'corr_mp_s5_i1_001',
          requestId: 'req_mp_s5_i1_001',
          environment: 'production',
          reason: 'digest_mismatch',
          stage: 'signature_validation'
        })
      );

      const sensitivePaths = collectSensitiveKeyPaths(event);
      expect(sensitivePaths).toEqual([]);
    });

    it('emits mp.webhook.processing_error with safe fields only (correlation/request id, env, reason/stage)', async () => {
      const events = await loadStructuredEventsModule();

      const event = events.buildMercadoPagoOperationalEvent({
        eventName: 'mp.webhook.processing_error',
        correlationId: 'corr_mp_s5_i1_002',
        requestId: 'req_mp_s5_i1_002',
        environment: 'production',
        reason: 'db_write_failed',
        stage: 'state_transition_apply',
        metadata: {
          providerPaymentId: 'mp_pay_0001',
          provider: 'mercado_pago'
        }
      });

      expect(event).toEqual(
        expect.objectContaining({
          eventName: 'mp.webhook.processing_error',
          correlationId: 'corr_mp_s5_i1_002',
          requestId: 'req_mp_s5_i1_002',
          environment: 'production',
          reason: 'db_write_failed',
          stage: 'state_transition_apply'
        })
      );

      const sensitivePaths = collectSensitiveKeyPaths(event);
      expect(sensitivePaths).toEqual([]);
    });
  });

  describe('2) minimal alerts contract', () => {
    it('requires signature-failure spike alert enabled with severity, owner and runbook link', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'mp_webhook_signature_failures_spike',
            enabled: true,
            severity: expect.stringMatching(/critical|high|medium|low/i),
            owner: expect.stringMatching(/\S+/),
            runbookUrl: expect.stringMatching(/\S+/)
          })
        ])
      );
    });

    it('requires processing-error spike alert enabled with severity, owner and runbook link', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'mp_webhook_processing_errors_spike',
            enabled: true,
            severity: expect.stringMatching(/critical|high|medium|low/i),
            owner: expect.stringMatching(/\S+/),
            runbookUrl: expect.stringMatching(/\S+/)
          })
        ])
      );
    });
  });

  describe('3) minimal production config gate', () => {
    it('fails when required production config/secrets are missing', async () => {
      const gateModule = await loadProductionConfigGateModule();

      const result = gateModule.evaluateMercadoPagoProductionConfigGate({
        environment: 'production',
        config: {
          webhookSecret: '',
          accessToken: '',
          webhookSecurityGuardrailEnabled: true
        }
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/webhook.*secret/i),
          expect.stringMatching(/access.*token/i)
        ])
      );
    });

    it('fails when webhook security guardrail is disabled', async () => {
      const gateModule = await loadProductionConfigGateModule();

      const result = gateModule.evaluateMercadoPagoProductionConfigGate({
        environment: 'production',
        config: {
          webhookSecret: 'prod_webhook_secret_xxx',
          accessToken: 'prod_access_token_xxx',
          webhookSecurityGuardrailEnabled: false
        }
      });

      expect(result.ok).toBe(false);
      expect(result.errors).toEqual(expect.arrayContaining([expect.stringMatching(/guardrail|security/i)]));
    });

    it('passes when minimum safe production config is present', async () => {
      const gateModule = await loadProductionConfigGateModule();

      const result = gateModule.evaluateMercadoPagoProductionConfigGate({
        environment: 'production',
        config: {
          webhookSecret: 'prod_webhook_secret_xxx',
          accessToken: 'prod_access_token_xxx',
          webhookSecurityGuardrailEnabled: true
        }
      });

      expect(result).toEqual({
        ok: true,
        errors: []
      });
    });
  });

  describe('4) rollback quick checklist artifact', () => {
    it('requires rollback quick checklist artifact and alert runbook references to it', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(
        fs.existsSync(ROLLBACK_CHECKLIST_PATH),
        `Missing rollback quick checklist artifact at ${ROLLBACK_CHECKLIST_RELATIVE}`
      ).toBe(true);

      const runbookLinks = alerts.map((alert) => alert.runbookUrl);
      expect(runbookLinks).toEqual(
        expect.arrayContaining([
          expect.stringContaining('mercadopago-webhook-rollback-quick-checklist'),
          expect.stringContaining('mercadopago-webhook-rollback-quick-checklist')
        ])
      );
    });
  });
});
