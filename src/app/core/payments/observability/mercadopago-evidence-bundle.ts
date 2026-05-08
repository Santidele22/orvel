import { getMercadoPagoAlertTuningSnapshot } from './mercadopago-alert-tuning'
import { canonicalizeMercadoPagoCorrelationId } from './mercadopago-correlation-id'
import { runMercadoPagoControlledNotificationDrill } from './mercadopago-controlled-drill'
import { runMercadoPagoOperationalSmokeChecks } from './mercadopago-smoke-checks'

export type EvidenceSignoff = {
  approvedBy: string
  approvedAtIso: string
  ticket: string
  actorId: string
  actorType: 'human' | 'service' | 'bot'
  approvalRefId: string
}

export type EvidenceIntegrity = {
  algorithm: 'sha256'
  digest: string
}

function stableSerialize(value: unknown): string {
  if (value === null) {
    return 'null'
  }

  if (value === undefined) {
    return '"__undefined__"'
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableSerialize(entry)).join(',')}]`
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, nested]) => `${JSON.stringify(key)}:${stableSerialize(nested)}`).join(',')}}`
  }

  return JSON.stringify(value)
}

async function sha256Hex(data: string): Promise<string> {
  const encoder = new TextEncoder()
  const buffer = await globalThis.crypto.subtle.digest('SHA-256', encoder.encode(data))
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

async function buildEvidenceIntegrity(payload: Record<string, unknown>): Promise<EvidenceIntegrity> {
  const digest = await sha256Hex(stableSerialize(payload))

  return {
    algorithm: 'sha256',
    digest
  }
}

export async function buildMercadoPagoOperationalEvidenceBundle(input: {
  environment: 'staging' | 'production'
  correlationId: string
}): Promise<{
  tuningSnapshot: ReturnType<typeof getMercadoPagoAlertTuningSnapshot>
  smokeLogs: ReturnType<typeof runMercadoPagoOperationalSmokeChecks>['webhookPath'][]
  drillLogs: {
    correlationId: string
    drillMode: true
    rollbackVerified: boolean
  }[]
  routingProof: ReturnType<typeof runMercadoPagoControlledNotificationDrill>['deliveryProof']
  signoff: EvidenceSignoff
  integrity: EvidenceIntegrity
}> {
  const correlationId = canonicalizeMercadoPagoCorrelationId(input.correlationId)

  const tuningSnapshot = getMercadoPagoAlertTuningSnapshot({
    environment: input.environment
  })

  const smokeResults = runMercadoPagoOperationalSmokeChecks({
    environment: input.environment,
    correlationId
  })

  const drillResult = runMercadoPagoControlledNotificationDrill({
    environment: input.environment,
    mode: 'synthetic',
    correlationId
  })

  const approvedAtIso = new Date().toISOString()

  const signoff = Object.freeze({
    approvedBy: 'payments-oncall',
    approvedAtIso,
    ticket: `OPS-MP-S5-I2-${input.environment}`,
    actorId: `payments-oncall-${input.environment}`,
    actorType: 'service' as const,
    approvalRefId: `mp_${input.environment}_${correlationId}`
  })

  const stablePayload = {
    environment: input.environment,
    correlationId,
    tuningSnapshot,
    smokeLogs: [smokeResults.webhookPath, smokeResults.alertPath],
    drillLogs: [
      {
        correlationId,
        drillMode: drillResult.drillMode,
        rollbackVerified: drillResult.rollbackVerified
      }
    ],
    routingProof: drillResult.deliveryProof,
    signoff
  }

  const integrity = await buildEvidenceIntegrity(stablePayload)

  return {
    tuningSnapshot,
    smokeLogs: [smokeResults.webhookPath, smokeResults.alertPath],
    drillLogs: [
      {
        correlationId,
        drillMode: drillResult.drillMode,
        rollbackVerified: drillResult.rollbackVerified
      }
    ],
    routingProof: drillResult.deliveryProof,
    signoff,
    integrity
  }
}
