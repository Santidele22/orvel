export type MercadoPagoOperationalEventName = 'mp.webhook.signature_failed' | 'mp.webhook.processing_error'

type RuntimeEnvironment = 'development' | 'staging' | 'production' | 'test'

type BuildMercadoPagoOperationalEventInput = {
  eventName: MercadoPagoOperationalEventName
  correlationId: string
  requestId: string
  environment: RuntimeEnvironment
  reason?: string
  stage?: string
  metadata?: Record<string, unknown>
  occurredAtIso?: string
}

export type MercadoPagoOperationalEvent = {
  eventName: MercadoPagoOperationalEventName
  occurredAtIso: string
  correlationId: string
  requestId: string
  environment: RuntimeEnvironment
  reason?: string
  stage?: string
  metadata?: Record<string, unknown>
}

const SENSITIVE_KEY_PATTERN = /(secret|token|signature|authorization|password|rawBody|x-signature)/i
const SECRET_LIKE_VALUE_PATTERN =
  /(bearer\s+[a-z0-9._-]+|sk_(live|test)_[a-z0-9]+|api[_-]?key\s*[:=]\s*\S+|x-signature\s*[:=]\s*\S+|token\s*[:=]\s*\S+)/i
const REDACTED_VALUE = '[REDACTED]'

function sanitizeMetadata(value: unknown): unknown {
  if (value === null || value === undefined) {
    return value
  }

  if (typeof value === 'string') {
    return SECRET_LIKE_VALUE_PATTERN.test(value) ? REDACTED_VALUE : value
  }

  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeMetadata(entry))
  }

  if (typeof value === 'object') {
    const sanitizedEntries = Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !SENSITIVE_KEY_PATTERN.test(key))
      .map(([key, nested]) => [key, sanitizeMetadata(nested)] as const)

    return Object.fromEntries(sanitizedEntries)
  }

  return value
}

export function buildMercadoPagoOperationalEvent(input: BuildMercadoPagoOperationalEventInput): MercadoPagoOperationalEvent {
  return {
    eventName: input.eventName,
    occurredAtIso: input.occurredAtIso ?? new Date().toISOString(),
    correlationId: input.correlationId,
    requestId: input.requestId,
    environment: input.environment,
    ...(input.reason ? { reason: input.reason } : {}),
    ...(input.stage ? { stage: input.stage } : {}),
    ...(input.metadata ? { metadata: sanitizeMetadata(input.metadata) as Record<string, unknown> } : {})
  }
}
