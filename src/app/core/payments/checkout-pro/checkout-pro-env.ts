const REQUIRED_CHECKOUT_PRO_CLIENT_ENV_KEYS = ['MP_PUBLIC_KEY', 'APP_BASE_URL'] as const;

type EnvSource = Record<string, string | undefined>;

type CheckoutProClientEnvKey = (typeof REQUIRED_CHECKOUT_PRO_CLIENT_ENV_KEYS)[number];

export type CheckoutProClientEnv = Record<CheckoutProClientEnvKey, string>;

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

function missingRequiredKeys(keys: readonly string[], source: EnvSource): string[] {
  return keys.filter((key) => isMissing(source[key]));
}

export { REQUIRED_CHECKOUT_PRO_CLIENT_ENV_KEYS };

export function loadCheckoutProClientEnv(source: EnvSource = defaultEnvSource()): CheckoutProClientEnv {
  const missing = missingRequiredKeys(REQUIRED_CHECKOUT_PRO_CLIENT_ENV_KEYS, source);

  if (missing.length > 0) {
    throw new Error(
      `[checkout-pro-env] Missing required client env vars: ${missing.join(', ')}. Configure Mercado Pago public env and restart runtime.`
    );
  }

  return {
    MP_PUBLIC_KEY: source['MP_PUBLIC_KEY'] as string,
    APP_BASE_URL: source['APP_BASE_URL'] as string
  };
}
