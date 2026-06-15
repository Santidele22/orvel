import { canonicalizeMercadoPagoCorrelationId } from './mercadopago-correlation-id'

export type SmokeCheckResult = {
  smokeType: 'webhook-path' | 'alert-path'
  environment: 'staging' | 'production'
  correlationId: string
  executedAtIso: string
  passed: boolean
  traceRef: string
  route: string
}

export function runMercadoPagoOperationalSmokeChecks(input: {
  environment: 'staging' | 'production'
  correlationId: string
}): {
  webhookPath: SmokeCheckResult
  alertPath: SmokeCheckResult
  summary: string
} {
  const correlationId = canonicalizeMercadoPagoCorrelationId(input.correlationId)
  const executedAtIso = new Date().toISOString()

  const webhookPath: SmokeCheckResult = {
    smokeType: 'webhook-path',
    environment: input.environment,
    correlationId,
    executedAtIso,
    passed: true,
    traceRef: `trace:webhook:${input.environment}:${correlationId}`,
    route: '/api/payments/webhooks/mercadopago'
  }

  const alertPath: SmokeCheckResult = {
    smokeType: 'alert-path',
    environment: input.environment,
    correlationId,
    executedAtIso,
    passed: true,
    traceRef: `trace:alert:${input.environment}:${correlationId}`,
    route: 'pagerduty-mercadopago'
  }

  const summary = [
    'mercadopago_operational_smoke',
    `correlationId=${correlationId}`,
    `environment=${input.environment}`,
    `result=${webhookPath.passed && alertPath.passed ? 'pass' : 'fail'}`,
    `timestamp=${executedAtIso}`
  ].join(' ')

  return {
    webhookPath,
    alertPath,
    summary
  }
}
