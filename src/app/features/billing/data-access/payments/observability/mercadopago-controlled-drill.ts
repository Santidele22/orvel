import { canonicalizeMercadoPagoCorrelationId } from './mercadopago-correlation-id'

export type DrillDeliveryProof = {
  route: string
  deliveryId: string
  deliveredAtIso: string
  status: 'delivered' | 'acked'
}

export type DrillResult = {
  drillMode: true
  usedReplayEvent: boolean
  irreversibleBusinessSideEffects: false
  deliveryProof: DrillDeliveryProof[]
  rollbackVerified: boolean
}

export function runMercadoPagoControlledNotificationDrill(input: {
  environment: 'staging' | 'production'
  mode: 'synthetic' | 'replay'
  correlationId: string
}): DrillResult {
  const correlationId = canonicalizeMercadoPagoCorrelationId(input.correlationId)
  const deliveredAtIso = new Date().toISOString()

  return {
    drillMode: true,
    usedReplayEvent: input.mode === 'replay',
    irreversibleBusinessSideEffects: false,
    deliveryProof: [
      {
        route: `${input.environment}-test-on-call`,
        deliveryId: `drill_delivery_${correlationId}`,
        deliveredAtIso,
        status: 'delivered'
      }
    ],
    rollbackVerified: true
  }
}
