type EnvSource = Record<string, string | undefined>;

export const REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS = [
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'MP_PREAPPROVAL_PLAN_ID',
  'APP_BASE_URL'
] as const;

type MercadoPagoSubscriptionEnvKey = (typeof REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS)[number];

export type MercadoPagoSubscriptionEnv = Record<MercadoPagoSubscriptionEnvKey, string>;

function defaultEnvSource(): EnvSource {
  const maybeProcess = globalThis as {
    process?: {
      env?: EnvSource;
    };
  };

  return maybeProcess.process?.env ?? {};
}

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function loadMercadoPagoSubscriptionEnv(
  source: EnvSource = defaultEnvSource()
): MercadoPagoSubscriptionEnv {
  const missing = REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS.filter((key) => isMissing(source[key]));

  if (missing.length > 0) {
    throw new Error(
      `[mercadopago-subscription-env] Missing required Mercado Pago subscription env vars: ${missing.join(', ')}.`
    );
  }

  return {
    MP_ACCESS_TOKEN: source['MP_ACCESS_TOKEN'] as string,
    MP_WEBHOOK_SECRET: source['MP_WEBHOOK_SECRET'] as string,
    MP_PREAPPROVAL_PLAN_ID: source['MP_PREAPPROVAL_PLAN_ID'] as string,
    APP_BASE_URL: source['APP_BASE_URL'] as string
  };
}
