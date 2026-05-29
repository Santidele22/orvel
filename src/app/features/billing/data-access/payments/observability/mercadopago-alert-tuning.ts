import { getMercadoPagoOperationalAlerts } from './mercadopago-operational-alerts'

type AlertSeverity = 'critical' | 'high' | 'medium' | 'low'
type NotificationRoute = 'pagerduty' | 'slack' | 'email' | 'opsgenie'

type AlertRoutingPolicy = {
  severity: AlertSeverity
  route: NotificationRoute
  onCallGroup: string
}

type AlertNoiseControls = {
  minVolumeGate: {
    enabled: boolean
    minEvents: number
    windowMinutes: number
  }
  thresholdWindow: {
    enabled: boolean
    sustainForMinutes: number
    evaluationEverySeconds: number
  }
  cooldown: {
    enabled: boolean
    suppressForMinutes: number
  }
}

export type TunedOperationalAlert = {
  key: string
  enabled: boolean
  severity: AlertSeverity
  owner: string
  runbookUrl: string
  noiseControls: AlertNoiseControls
  suppressionPolicy: {
    strategy: 'default_suppression' | 'never_suppress_critical'
    allowsCooldown: boolean
  }
}

export type AlertTuningSnapshot = {
  environment: 'staging' | 'production'
  generatedAtIso: string
  alerts: TunedOperationalAlert[]
  routing: AlertRoutingPolicy[]
}

const DEFAULT_NOISE_CONTROLS: AlertNoiseControls = {
  minVolumeGate: {
    enabled: true,
    minEvents: 5,
    windowMinutes: 10
  },
  thresholdWindow: {
    enabled: true,
    sustainForMinutes: 5,
    evaluationEverySeconds: 60
  },
  cooldown: {
    enabled: true,
    suppressForMinutes: 15
  }
}

const ROUTING_BY_SEVERITY: AlertRoutingPolicy[] = [
  { severity: 'critical', route: 'pagerduty', onCallGroup: 'payments-primary-oncall' },
  { severity: 'high', route: 'opsgenie', onCallGroup: 'payments-secondary-oncall' },
  { severity: 'medium', route: 'slack', onCallGroup: 'payments-observability' },
  { severity: 'low', route: 'email', onCallGroup: 'payments-observability' }
]

export function getMercadoPagoAlertTuningSnapshot(input: {
  environment: 'staging' | 'production'
}): AlertTuningSnapshot {
  const baseAlerts = getMercadoPagoOperationalAlerts()

  const alerts: TunedOperationalAlert[] = baseAlerts.map((alert) => {
    const isCriticalInProduction = input.environment === 'production' && alert.severity === 'critical'

    return {
      ...alert,
      noiseControls: {
        minVolumeGate: { ...DEFAULT_NOISE_CONTROLS.minVolumeGate },
        thresholdWindow: { ...DEFAULT_NOISE_CONTROLS.thresholdWindow },
        cooldown: {
          ...DEFAULT_NOISE_CONTROLS.cooldown,
          enabled: isCriticalInProduction ? false : DEFAULT_NOISE_CONTROLS.cooldown.enabled
        }
      },
      suppressionPolicy: isCriticalInProduction
        ? {
            strategy: 'never_suppress_critical',
            allowsCooldown: false
          }
        : {
            strategy: 'default_suppression',
            allowsCooldown: true
          }
    }
  })

  return {
    environment: input.environment,
    generatedAtIso: new Date().toISOString(),
    alerts,
    routing: ROUTING_BY_SEVERITY
  }
}
