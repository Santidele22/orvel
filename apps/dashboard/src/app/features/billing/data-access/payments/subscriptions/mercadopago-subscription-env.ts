export type MercadoPagoSubscriptionEnv = Record<(typeof REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS)[number], string>;

export const REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS = [
  'MP_PREAPPROVAL_PLAN_ID',
  'APP_BASE_URL'
] as const;

export function loadMercadoPagoSubscriptionEnv(
  source: Record<string, string | undefined> = {}
): MercadoPagoSubscriptionEnv {
  const missing = REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS.filter((key) => !source[key]?.trim());

  if (missing.length > 0) {
    throw new Error(`Missing required Mercado Pago subscription environment keys: ${missing.join(', ')}`);
  }

  return Object.fromEntries(
    REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS.map((key) => [key, source[key]!.trim()])
  ) as MercadoPagoSubscriptionEnv;
}
