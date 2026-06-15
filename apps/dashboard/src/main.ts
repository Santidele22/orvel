import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { evaluateMercadoPagoProductionConfigGate } from './app/features/billing/data-access/payments/observability/mercadopago-production-config-gate';

type RuntimeEnvironment = 'development' | 'staging' | 'production' | 'test';

function resolveRuntimeEnvironment(): RuntimeEnvironment {
  const globalEnv = (globalThis as { __APP_ENV__?: string }).__APP_ENV__;
  const viteEnv = (import.meta as { env?: { MODE?: string; PROD?: boolean } }).env;
  const mode = globalEnv ?? viteEnv?.MODE;

  if (mode === 'production' || viteEnv?.PROD) {
    return 'production';
  }

  if (mode === 'staging') {
    return 'staging';
  }

  if (mode === 'test') {
    return 'test';
  }

  return 'development';
}

function enforceMercadoPagoProductionConfigGate(): void {
  const runtimeEnvironment = resolveRuntimeEnvironment();
  const runtimeConfig = globalThis as {
    __PAYMENTS_RUNTIME_CONFIG__?: {
      mercadoPagoWebhookSecret?: string;
      mercadoPagoAccessToken?: string;
    };
    __MP_WEBHOOK_SECURITY_GUARDRAIL_ENABLED__?: boolean;
  };

  const gateResult = evaluateMercadoPagoProductionConfigGate({
    environment: runtimeEnvironment,
    config: {
      webhookSecret: runtimeConfig.__PAYMENTS_RUNTIME_CONFIG__?.mercadoPagoWebhookSecret,
      accessToken: runtimeConfig.__PAYMENTS_RUNTIME_CONFIG__?.mercadoPagoAccessToken,
      webhookSecurityGuardrailEnabled: runtimeConfig.__MP_WEBHOOK_SECURITY_GUARDRAIL_ENABLED__
    }
  });

  if (!gateResult.ok) {
    throw new Error(`Mercado Pago production config gate failed: ${gateResult.errors.join(' | ')}`);
  }
}

enforceMercadoPagoProductionConfigGate();

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
