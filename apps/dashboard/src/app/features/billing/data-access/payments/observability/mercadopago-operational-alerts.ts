type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'

export type MercadoPagoOperationalAlert = {
  key:
    | 'mp_webhook_signature_failures_spike'
    | 'mp_webhook_processing_errors_spike'
    | 'mp_webhook_success_rate_slo_breach'
    | 'mp_payment_state_integrity_anomaly'
    | 'mp_production_gate_validation_failed'
  enabled: boolean
  severity: AlertSeverity
  owner: string
  runbookUrl: string
}

const ROLLBACK_RUNBOOK_URL = 'docs/runbooks/mercadopago-webhook-rollback-quick-checklist.md'

const DEFAULT_ALERT_OWNER = 'payments-oncall'

export function getMercadoPagoOperationalAlerts(): MercadoPagoOperationalAlert[] {
  return [
    {
      key: 'mp_webhook_signature_failures_spike',
      enabled: true,
      severity: 'high',
      owner: DEFAULT_ALERT_OWNER,
      runbookUrl: ROLLBACK_RUNBOOK_URL
    },
    {
      key: 'mp_webhook_processing_errors_spike',
      enabled: true,
      severity: 'critical',
      owner: DEFAULT_ALERT_OWNER,
      runbookUrl: ROLLBACK_RUNBOOK_URL
    },
    {
      key: 'mp_webhook_success_rate_slo_breach',
      enabled: true,
      severity: 'critical',
      owner: DEFAULT_ALERT_OWNER,
      runbookUrl: ROLLBACK_RUNBOOK_URL
    },
    {
      key: 'mp_payment_state_integrity_anomaly',
      enabled: true,
      severity: 'high',
      owner: DEFAULT_ALERT_OWNER,
      runbookUrl: ROLLBACK_RUNBOOK_URL
    },
    {
      key: 'mp_production_gate_validation_failed',
      enabled: true,
      severity: 'high',
      owner: DEFAULT_ALERT_OWNER,
      runbookUrl: ROLLBACK_RUNBOOK_URL
    }
  ]
}
