import { afterEach, describe, expect, it, vi } from 'vitest';

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low';

type AlertTuningSnapshot = {
  environment: 'staging' | 'production';
  generatedAtIso: string;
  alerts: Array<{
    key: string;
    severity: AlertSeverity;
    noiseControls: {
      minVolumeGate: { enabled: boolean; minEvents: number; windowMinutes: number };
      thresholdWindow: { enabled: boolean; sustainForMinutes: number; evaluationEverySeconds: number };
      cooldown: { enabled: boolean; suppressForMinutes: number };
    };
    [key: string]: unknown;
  }>;
  routing: Array<{ severity: AlertSeverity; route: string; onCallGroup: string }>;
};

type AlertTuningModule = {
  getMercadoPagoAlertTuningSnapshot: (input: {
    environment: 'staging' | 'production';
  }) => AlertTuningSnapshot;
};

type SmokeChecksModule = {
  runMercadoPagoOperationalSmokeChecks: (input: {
    environment: 'staging' | 'production';
    correlationId: string;
  }) => {
    webhookPath: {
      correlationId: string;
      traceRef: string;
      executedAtIso: string;
    };
    alertPath: {
      correlationId: string;
      traceRef: string;
      executedAtIso: string;
    };
    summary: string;
  };
};

type ControlledDrillModule = {
  runMercadoPagoControlledNotificationDrill: (input: {
    environment: 'staging' | 'production';
    mode: 'synthetic' | 'replay';
    correlationId: string;
  }) => {
    drillMode: true;
    rollbackVerified: boolean;
    deliveryProof: Array<{
      route: string;
      deliveryId: string;
      deliveredAtIso: string;
      status: 'delivered' | 'acked';
    }>;
  };
};

type EvidenceBundleModule = {
  buildMercadoPagoOperationalEvidenceBundle: (input: {
    environment: 'staging' | 'production';
    correlationId: string;
  }) => {
    tuningSnapshot: AlertTuningSnapshot;
    smokeLogs: Array<{ correlationId: string; traceRef: string }>;
    drillLogs: Array<{ correlationId: string; drillMode: true; rollbackVerified: boolean }>;
    routingProof: Array<{ route: string; deliveryId: string }>;
    signoff: Record<string, unknown>;
    [key: string]: unknown;
  };
};

const SAFE_CORRELATION_ID_PATTERN = /^[a-zA-Z0-9._:-]{1,64}$/;
const SAFE_TRACE_TOKEN_PATTERN = /^[a-zA-Z0-9._:-]+$/;

afterEach(() => {
  vi.useRealTimers();
});

async function loadAlertTuningModule(): Promise<AlertTuningModule> {
  const mod = await import('../../core/payments/observability/mercadopago-alert-tuning');
  return mod as AlertTuningModule;
}

async function loadSmokeChecksModule(): Promise<SmokeChecksModule> {
  const mod = await import('../../core/payments/observability/mercadopago-smoke-checks');
  return mod as SmokeChecksModule;
}

async function loadControlledDrillModule(): Promise<ControlledDrillModule> {
  const mod = await import('../../core/payments/observability/mercadopago-controlled-drill');
  return mod as ControlledDrillModule;
}

async function loadEvidenceBundleModule(): Promise<EvidenceBundleModule> {
  const mod = await import('../../core/payments/observability/mercadopago-evidence-bundle');
  return mod as EvidenceBundleModule;
}

describe('Mercado Pago S5c RED contract (security hardening follow-up for S5-I2)', () => {
  describe('1) correlationId hardening', () => {
    it('canonicalizes/validates correlationId before writing trace/log/evidence fields', async () => {
      const smoke = await loadSmokeChecksModule();
      const drill = await loadControlledDrillModule();
      const evidence = await loadEvidenceBundleModule();

      const inputCorrelationId = 'corr mp s5c/../../unsafe';

      const smokeResult = smoke.runMercadoPagoOperationalSmokeChecks({
        environment: 'staging',
        correlationId: inputCorrelationId
      });

      const drillResult = drill.runMercadoPagoControlledNotificationDrill({
        environment: 'staging',
        mode: 'synthetic',
        correlationId: inputCorrelationId
      });

      const evidenceBundle = evidence.buildMercadoPagoOperationalEvidenceBundle({
        environment: 'staging',
        correlationId: inputCorrelationId
      });

      expect(smokeResult.webhookPath.correlationId).toMatch(SAFE_CORRELATION_ID_PATTERN);
      expect(smokeResult.alertPath.correlationId).toMatch(SAFE_CORRELATION_ID_PATTERN);
      expect(smokeResult.webhookPath.traceRef).toMatch(SAFE_TRACE_TOKEN_PATTERN);
      expect(smokeResult.alertPath.traceRef).toMatch(SAFE_TRACE_TOKEN_PATTERN);
      expect(drillResult.deliveryProof[0]?.deliveryId).toMatch(SAFE_TRACE_TOKEN_PATTERN);
      expect(evidenceBundle.drillLogs[0]?.correlationId).toMatch(SAFE_CORRELATION_ID_PATTERN);
      expect(evidenceBundle.smokeLogs[0]?.correlationId).toMatch(SAFE_CORRELATION_ID_PATTERN);
    });

    it('rejects or sanitizes correlationId control chars/newlines to prevent log forging', async () => {
      const smoke = await loadSmokeChecksModule();
      const evidence = await loadEvidenceBundleModule();

      const forgedCorrelationId = 'corr_s5c_001\nX-Forged: yes\u0000';

      const smokeAttempt = () =>
        smoke.runMercadoPagoOperationalSmokeChecks({
          environment: 'production',
          correlationId: forgedCorrelationId
        });

      const evidenceAttempt = () =>
        evidence.buildMercadoPagoOperationalEvidenceBundle({
          environment: 'production',
          correlationId: forgedCorrelationId
        });

      const smokeRejected = (() => {
        try {
          smokeAttempt();
          return false;
        } catch {
          return true;
        }
      })();

      const evidenceRejected = (() => {
        try {
          evidenceAttempt();
          return false;
        } catch {
          return true;
        }
      })();

      if (!smokeRejected) {
        const smokeResult = smokeAttempt();
        expect(smokeResult.summary).not.toMatch(/[\n\r\u0000]/);
        expect(smokeResult.webhookPath.traceRef).not.toMatch(/[\n\r\u0000]/);
        expect(smokeResult.alertPath.traceRef).not.toMatch(/[\n\r\u0000]/);
      }

      if (!evidenceRejected) {
        const bundle = evidenceAttempt();
        expect(bundle.drillLogs[0]?.correlationId).not.toMatch(/[\n\r\u0000]/);
      }

    });
  });

  describe('2) evidence integrity', () => {
    it('requires deterministic evidence integrity digest/hash in bundle payload', async () => {
      const evidence = await loadEvidenceBundleModule();

      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-04-21T10:15:30.000Z'));

      const bundleA = evidence.buildMercadoPagoOperationalEvidenceBundle({
        environment: 'production',
        correlationId: 'corr_mp_s5c_evidence_001'
      }) as Record<string, unknown>;

      const bundleB = evidence.buildMercadoPagoOperationalEvidenceBundle({
        environment: 'production',
        correlationId: 'corr_mp_s5c_evidence_001'
      }) as Record<string, unknown>;

      expect(bundleA.integrity).toEqual(
        expect.objectContaining({
          algorithm: expect.stringMatching(/sha-?256|sha-?512/i),
          digest: expect.stringMatching(/^[a-f0-9]{64,128}$/i)
        })
      );

      expect(bundleA.integrity).toEqual(bundleB.integrity);
    });

    it('requires signoff provenance (non-static actor) + immutable approval reference/id', async () => {
      const evidence = await loadEvidenceBundleModule();

      const bundle = evidence.buildMercadoPagoOperationalEvidenceBundle({
        environment: 'production',
        correlationId: 'corr_mp_s5c_evidence_002'
      });

      const signoff = bundle.signoff as Record<string, unknown>;

      expect(signoff).toEqual(
        expect.objectContaining({
          actorId: expect.stringMatching(/\S+/),
          actorType: expect.stringMatching(/human|service|bot/i),
          approvalRefId: expect.stringMatching(/\S+/)
        })
      );

      expect(String(signoff.actorId)).not.toBe('payments-oncall');
      expect(String(signoff.approvalRefId)).toMatch(/mp[-_a-z0-9]{8,}|[0-9a-f]{8}-[0-9a-f-]{27,}/i);
      expect(Object.isFrozen(signoff)).toBe(true);
    });
  });

  describe('3) severity-aware tuning', () => {
    it('applies explicit override policy so critical alerts are not suppressed like low/medium', async () => {
      const tuning = await loadAlertTuningModule();
      const snapshot = tuning.getMercadoPagoAlertTuningSnapshot({ environment: 'production' });

      const criticalAlerts = snapshot.alerts.filter((alert) => alert.severity === 'critical');
      const nonCriticalAlerts = snapshot.alerts.filter((alert) => alert.severity !== 'critical');

      expect(criticalAlerts.length).toBeGreaterThan(0);
      expect(nonCriticalAlerts.length).toBeGreaterThan(0);

      for (const criticalAlert of criticalAlerts) {
        expect((criticalAlert as Record<string, unknown>).suppressionPolicy).toEqual(
          expect.objectContaining({
            strategy: 'never_suppress_critical',
            allowsCooldown: false
          })
        );
        expect(criticalAlert.noiseControls.cooldown.enabled).toBe(false);
        expect(criticalAlert.noiseControls.thresholdWindow.enabled).toBe(true);
      }

      for (const nonCriticalAlert of nonCriticalAlerts) {
        expect(nonCriticalAlert.noiseControls.cooldown.enabled).toBe(true);
      }
    });
  });

  describe('4) baseline compatibility intent (S5/S5b/S5-I2)', () => {
    it('keeps baseline routing + smoke + drill evidence structure while adding hardening fields', async () => {
      const tuning = await loadAlertTuningModule();
      const smoke = await loadSmokeChecksModule();
      const drill = await loadControlledDrillModule();
      const evidence = await loadEvidenceBundleModule();

      const snapshot = tuning.getMercadoPagoAlertTuningSnapshot({ environment: 'staging' });
      expect(snapshot.routing).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ severity: 'critical', route: expect.any(String) }),
          expect.objectContaining({ severity: 'high', route: expect.any(String) }),
          expect.objectContaining({ severity: 'medium', route: expect.any(String) }),
          expect.objectContaining({ severity: 'low', route: expect.any(String) })
        ])
      );

      const smokeResult = smoke.runMercadoPagoOperationalSmokeChecks({
        environment: 'staging',
        correlationId: 'corr_mp_s5c_baseline_001'
      });
      expect(smokeResult.summary).toMatch(/corr_mp_s5c_baseline_001/);

      const drillResult = drill.runMercadoPagoControlledNotificationDrill({
        environment: 'staging',
        mode: 'synthetic',
        correlationId: 'corr_mp_s5c_baseline_001'
      });
      expect(drillResult.rollbackVerified).toBe(true);

      const bundle = evidence.buildMercadoPagoOperationalEvidenceBundle({
        environment: 'staging',
        correlationId: 'corr_mp_s5c_baseline_001'
      });
      expect(bundle.smokeLogs.length).toBeGreaterThan(0);
      expect(bundle.routingProof.length).toBeGreaterThan(0);
    });
  });
});
