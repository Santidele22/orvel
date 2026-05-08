type RuntimeEnvironment = 'development' | 'staging' | 'production' | 'test'

type MercadoPagoProductionConfig = {
  webhookSecret?: string
  accessToken?: string
  webhookSecurityGuardrailEnabled?: boolean
}

type EvaluateProductionConfigGateInput = {
  environment: RuntimeEnvironment
  config: MercadoPagoProductionConfig
}

type EvaluateProductionConfigGateResult = {
  ok: boolean
  errors: string[]
}

function isMissingRequiredValue(value: string | undefined): boolean {
  return !value || value.trim().length === 0
}

export function evaluateMercadoPagoProductionConfigGate(
  input: EvaluateProductionConfigGateInput
): EvaluateProductionConfigGateResult {
  if (input.environment !== 'production') {
    return {
      ok: true,
      errors: []
    }
  }

  const errors: string[] = []

  if (isMissingRequiredValue(input.config.webhookSecret)) {
    errors.push('Missing required Mercado Pago webhook secret for production environment.')
  }

  if (isMissingRequiredValue(input.config.accessToken)) {
    errors.push('Missing required Mercado Pago access token for production environment.')
  }

  if (input.config.webhookSecurityGuardrailEnabled !== true) {
    errors.push('Webhook security guardrail must be enabled in production.')
  }

  return {
    ok: errors.length === 0,
    errors
  }
}
