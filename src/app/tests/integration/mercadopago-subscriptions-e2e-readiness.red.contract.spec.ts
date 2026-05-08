import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(TEST_DIR, '../../../../..');
const CREATE_SUBSCRIPTION_FN = path.join(ROOT, 'supabase', 'functions', 'create-subscription', 'index.ts');
const WEBHOOK_FN = path.join(ROOT, 'supabase', 'functions', 'mercadopago-webhook', 'index.ts');
const FRONTEND_CORE = path.join(ROOT, 'src', 'app', 'core');

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Mercado Pago subscriptions end-to-end readiness (RED contracts)', () => {
  describe('1) Frontend -> create-subscription contract payload/response', () => {
    it('must expose a frontend API adapter with a strict create-subscription request/response contract', async () => {
      try {
        const mod = await import('../../core/payments/subscriptions/create-subscription.api');
        const api = mod as {
          createSubscription: (input: { planCode: 'FREE' | 'BASIC' | 'MEDIUM' | 'PRO' }) => Promise<{
            ok: boolean;
            initPoint: string | null;
            subscriptionId: string;
            status: 'pending' | 'active';
            message: string;
          }>;
        };

        expect(typeof api.createSubscription).toBe('function');
      } catch {
        throw new Error(
          'TODO(Aurora/Magnus): add src/app/core/payments/subscriptions/create-subscription.api.ts exporting createSubscription({ planCode }) with a typed contract mapped from Edge Function response { success, subscription, init_point, message }.'
        );
      }
    });

    it('must keep create-subscription edge payload minimal and server-derived (only plan_code from client)', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/interface\s+SubscriptionRequest\s*\{[\s\S]*plan_code\s*:\s*string\s*;[\s\S]*\}/m);
      expect(source).not.toMatch(/body\s*\.\s*price\b/);
      expect(source).not.toMatch(/body\s*\.\s*amount\b/);
      expect(source).toMatch(/JSON\.stringify\(\{[\s\S]*success:\s*true[\s\S]*init_point[\s\S]*message[\s\S]*\}\)/m);
    });

    it('must send strict associated-plan payload to MP /preapproval when strict flag is enabled', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/preapproval_plan_id\s*:/);
      expect(source).toMatch(/card_token_id\s*:/);
      expect(source).toMatch(/status\s*:\s*["']authorized["']/);
      expect(source).toMatch(/fetch\([^\n]*\/preapproval/);
    });

    it('must fail with controlled 4xx when strict contract misses card_token_id', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/CARD_TOKEN_ID_REQUIRED/);
      expect(source).toMatch(/status:\s*400/);
    });

    it('must fail with controlled 4xx when strict contract misses preapproval_plan_id', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/PREAPPROVAL_PLAN_ID_REQUIRED/);
      expect(source).toMatch(/status:\s*400/);
    });

    it('must fail with controlled 4xx and explicit codes when strict identifiers have invalid format', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/CARD_TOKEN_ID_INVALID_FORMAT/);
      expect(source).toMatch(/PREAPPROVAL_PLAN_ID_INVALID_FORMAT/);
      expect(source).toMatch(/status:\s*400/);
    });

    it('must keep transitional feature-flag behavior: strict enabled/disabled branches explicit', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/MP_ASSOCIATED_PLAN_STRICT_MODE|MP_SUBSCRIPTIONS_STRICT_ASSOCIATED_PLAN/);
      expect(source).toMatch(/===\s*["']true["']|toLowerCase\(\)\s*===\s*["']true["']/);
      expect(source).toMatch(/if\s*\(.*strict.*\)[\s\S]*preapproval_plan_id[\s\S]*else[\s\S]*auto_recurring/mi);
    });

    it('must surface sanitized Mercado Pago upstream error diagnostics without sensitive fields', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);
      const mpErrorBranch = source.slice(source.indexOf('if (!mpResponse.ok)'));

      expect(source).toMatch(/sanitizeMercadoPagoError/);
      expect(mpErrorBranch).toMatch(/upstream_error/);
      expect(source).toMatch(/provider:\s*["']mercado_pago["']/);
      expect(mpErrorBranch).not.toMatch(/card_token_id|normalizedCardTokenId|Authorization|mpAccessToken/);
    });
  });

  describe('2) Webhook processing contract with signature/idempotency path', () => {
    it('must enforce signature verification in all environments (no dev bypass branch)', () => {
      const source = readRequiredFile(WEBHOOK_FN);

      expect(source).not.toMatch(/skip\s+for\s+development/i);
      expect(source).not.toMatch(/if\s*\(!isDev\)\s*\{/m);
      expect(source).toMatch(/INVALID_SIGNATURE/);
    });

    it('must persist idempotency before side effects with provider_event_id and payload_hash', () => {
      const source = readRequiredFile(WEBHOOK_FN);

      const idempotencyWrite = source.search(/\.from\("payment_webhook_events"\)[\s\S]*\.upsert\(/m);
      const subscriptionUpdate = source.search(/\.from\("business_subscriptions"\)[\s\S]*\.update\(/m);

      expect(idempotencyWrite).toBeGreaterThan(-1);
      expect(subscriptionUpdate).toBeGreaterThan(-1);
      expect(idempotencyWrite, 'Idempotency write should happen before mutating subscription/payment state').toBeLessThan(subscriptionUpdate);
      expect(source).toMatch(/payload_hash/);
      expect(source).toMatch(/provider_event_id/);
      expect(source, 'Idempotency read path should include payload_hash for replay/mismatch detection').toMatch(
        /select\("id,\s*processed_at,\s*payload_hash"\)|select\("payload_hash,\s*processed_at,\s*id"\)/
      );
    });

    it('must fail-closed when server-truth verification with MP cannot be completed', () => {
      const source = readRequiredFile(WEBHOOK_FN);

      expect(source).toMatch(/MP_VERIFICATION_UNAVAILABLE/);
      expect(source).toMatch(/mark_payment_webhook_event_state/);
      expect(source).toMatch(/p_state:\s*["']failed["']/);
      expect(source).not.toMatch(/using payload status/i);
    });
  });

  describe('3) Plan assignment/entitlements sync after approved payment event', () => {
    it('must trigger plan entitlements sync when payment/preapproval becomes active/approved', () => {
      const source = readRequiredFile(WEBHOOK_FN);

      expect(source).toMatch(/\b(active|approved)\b/);
      expect(source, 'Missing entitlements sync path after approved payment event').toMatch(
        /entitlements|plan_entitlements|get_business_entitlements_snapshot|syncForBusiness/i
      );
    });
  });

  describe('4) Failure surfaces (invalid signature, missing env keys)', () => {
    it('must return explicit server config errors when required env keys are missing', () => {
      const createSub = readRequiredFile(CREATE_SUBSCRIPTION_FN);
      const webhook = readRequiredFile(WEBHOOK_FN);

      expect(createSub).toMatch(/MP_CONFIG_ERROR/);
      expect(webhook).toMatch(/SERVER_CONFIG_ERROR|MP_ACCESS_TOKEN not configured/);
      expect(webhook, 'Webhook must fail fast when MP_WEBHOOK_SECRET is missing').toMatch(/MP_WEBHOOK_SECRET/);
    });

    it('must include core keys in required env contract for subscription flow', async () => {
      const env = await import('../../core/payments/subscriptions/mercadopago-subscription-env');
      const requiredKeys = (env as { REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS: readonly string[] })
        .REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS;

      expect(requiredKeys).toEqual(
        expect.arrayContaining(['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET', 'MP_PREAPPROVAL_PLAN_ID', 'APP_BASE_URL'])
      );
    });
  });

  describe('Deployed workflow guardrail', () => {
    it('must include CI workflow that deploys both subscription functions', () => {
      const workflow = readRequiredFile(path.join(ROOT, '.github', 'workflows', 'deploy.yml'));

      expect(workflow).toMatch(/create-subscription/);
      expect(workflow).toMatch(/mercadopago-webhook/);
    });
  });
});
