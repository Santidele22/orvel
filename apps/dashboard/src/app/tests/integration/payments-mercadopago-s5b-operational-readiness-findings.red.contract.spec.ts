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
  metadata?: Record<string, unknown>;
};

type StructuredEventsModule = {
  buildMercadoPagoOperationalEvent: (input: {
    eventName: StructuredEventName;
    correlationId: string;
    requestId: string;
    environment: 'development' | 'staging' | 'production' | 'test';
    metadata?: Record<string, unknown>;
    occurredAtIso?: string;
  }) => StructuredOperationalEvent;
};

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

type ExtendedOperationalAlert = {
  key: string;
  enabled: boolean;
  severity: AlertSeverity;
  owner: string;
  runbookUrl: string;
};

type AlertsModule = {
  getMercadoPagoOperationalAlerts: () => ExtendedOperationalAlert[];
};

const ROOT = process.cwd();
const MAIN_BOOTSTRAP_PATH = path.join(ROOT, 'src', 'main.ts');
const SECRET_LIKE_VALUE_PATTERN = /(bearer\s+[a-z0-9._-]+|sk_(live|test)_[a-z0-9]+|api[_-]?key\s*[:=]\s*\S+|x-signature\s*[:=]\s*\S+|token\s*[:=]\s*\S+)/i;

async function loadStructuredEventsModule(): Promise<StructuredEventsModule> {
  try {
    const mod = await import('../../core/payments/observability/mercadopago-operational-events');
    return mod as StructuredEventsModule;
  } catch {
    throw new Error(
      'TODO(Magnus): expose buildMercadoPagoOperationalEvent() from observability module for telemetry hardening contracts.'
    );
  }
}

async function loadAlertsModule(): Promise<AlertsModule> {
  try {
    const mod = await import('../../core/payments/observability/mercadopago-operational-alerts');
    return mod as AlertsModule;
  } catch {
    throw new Error(
      'TODO(Magnus): expose getMercadoPagoOperationalAlerts() from observability module for expanded alert contracts.'
    );
  }
}

function collectSecretLikeValuePaths(value: unknown, basePath = 'event'): string[] {
  if (value === null || value === undefined) {
    return [];
  }

  if (typeof value === 'string') {
    return SECRET_LIKE_VALUE_PATTERN.test(value) ? [basePath] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => collectSecretLikeValuePaths(entry, `${basePath}.${index}`));
  }

  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, nested]) =>
      collectSecretLikeValuePaths(nested, `${basePath}.${key}`)
    );
  }

  return [];
}

describe('Mercado Pago S5b RED contracts (Gabriela findings)', () => {
  describe('1) mandatory production gate enforcement', () => {
    it('requires startup/boot path to invoke production gate and fail-closed on invalid production config', () => {
      expect(fs.existsSync(MAIN_BOOTSTRAP_PATH), `Missing startup entrypoint at ${MAIN_BOOTSTRAP_PATH}`).toBe(true);

      const bootstrapSource = fs.readFileSync(MAIN_BOOTSTRAP_PATH, 'utf8');

      expect(bootstrapSource).toMatch(/evaluateMercadoPagoProductionConfigGate|enforceMercadoPagoProductionConfigGate/);
      expect(bootstrapSource).toMatch(/throw\s+new\s+Error|process\.exit\s*\(\s*1\s*\)/);
    });
  });

  describe('2) telemetry hardening', () => {
    it('redacts secret-like values even when they appear under benign metadata keys', async () => {
      const events = await loadStructuredEventsModule();

      const event = events.buildMercadoPagoOperationalEvent({
        eventName: 'mp.webhook.processing_error',
        correlationId: 'corr_mp_s5b_001',
        requestId: 'req_mp_s5b_001',
        environment: 'production',
        metadata: {
          notes: 'Bearer mp_live_very_sensitive_token',
          diagnostics: {
            details: 'apiKey=mp_super_secret_key'
          },
          labels: ['ok', 'x-signature: sha256=abcdef123456']
        }
      });

      const secretValuePaths = collectSecretLikeValuePaths(event.metadata);
      expect(secretValuePaths).toEqual([]);
    });
  });

  describe('3) alert coverage expansion', () => {
    it('requires webhook success-rate/SLO breach alert', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'mp_webhook_success_rate_slo_breach',
            enabled: true,
            severity: expect.stringMatching(/critical|high|medium|low/i),
            owner: expect.stringMatching(/\S+/),
            runbookUrl: expect.stringMatching(/\S+/)
          })
        ])
      );
    });

    it('requires payment state integrity anomaly alert (duplicate/missing transition)', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'mp_payment_state_integrity_anomaly',
            enabled: true,
            severity: expect.stringMatching(/critical|high|medium|low/i),
            owner: expect.stringMatching(/\S+/),
            runbookUrl: expect.stringMatching(/\S+/)
          })
        ])
      );
    });

    it('requires production gate/security validation failure alert', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: 'mp_production_gate_validation_failed',
            enabled: true,
            severity: expect.stringMatching(/critical|high|medium|low/i),
            owner: expect.stringMatching(/\S+/),
            runbookUrl: expect.stringMatching(/\S+/)
          })
        ])
      );
    });
  });

  describe('4) S5-I1 no-regression intent', () => {
    it('keeps previous baseline alerts contract for signature and processing spikes', async () => {
      const alertsModule = await loadAlertsModule();
      const alerts = alertsModule.getMercadoPagoOperationalAlerts();

      expect(alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ key: 'mp_webhook_signature_failures_spike', enabled: true }),
          expect.objectContaining({ key: 'mp_webhook_processing_errors_spike', enabled: true })
        ])
      );
    });
  });
});
