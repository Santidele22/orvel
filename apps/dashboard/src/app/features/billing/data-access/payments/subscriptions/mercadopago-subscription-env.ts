export type MercadoPagoSubscriptionEnv = Record<string, never>;

export const REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS = [] as const;

export function loadMercadoPagoSubscriptionEnv(): MercadoPagoSubscriptionEnv {
  throw new Error(
    '[mercadopago-subscription-env] Server-only Mercado Pago subscription configuration is disabled in the Angular bundle.'
  );
}
