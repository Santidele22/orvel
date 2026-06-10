import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = findRepoRoot(TEST_DIR);
const CREATE_SUBSCRIPTION_FN = path.join(ROOT, 'supabase', 'functions', 'create-subscription', 'index.ts');
const WEBHOOK_FN = path.join(ROOT, 'supabase', 'functions', 'mercadopago-webhook', 'index.ts');
const DEPLOY_WORKFLOW = findExistingFile(ROOT, [
  ['.github', 'workflows', 'deploy.yml'],
  ['apps', 'dashboard', '.github', 'workflows', 'deploy.yml'],
]);

function findRepoRoot(startDir: string): string {
  let currentDir = startDir;

  while (currentDir !== path.dirname(currentDir)) {
    if (
      fs.existsSync(path.join(currentDir, 'infra', 'context', 'supabase.md')) &&
      fs.existsSync(path.join(currentDir, 'supabase', 'functions'))
    ) {
      return currentDir;
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Unable to resolve repository root from ${startDir}`);
}

function findExistingFile(root: string, relativeCandidates: string[][]): string {
  const candidates = relativeCandidates.map((candidate) => path.join(root, ...candidate));
  const existing = candidates.find((candidate) => fs.existsSync(candidate));

  if (!existing) {
    throw new Error(`Missing file. Checked: ${candidates.map((candidate) => path.relative(root, candidate)).join(', ')}`);
  }

  return existing;
}

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

    it('must keep create-subscription edge payload server-derived (no client price/amount)', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/interface\s+SubscriptionRequest\s*\{[\s\S]*plan_code\s*:\s*string\s*;[\s\S]*\}/m);
      expect(source).not.toMatch(/body\s*\.\s*price\b/);
      expect(source).not.toMatch(/body\s*\.\s*amount\b/);
      expect(source).toMatch(/JSON\.stringify\(\{[\s\S]*success:\s*true[\s\S]*init_point[\s\S]*message[\s\S]*\}\)/m);
    });

    it('must send canonical dynamic preapproval payload to MP /preapproval without client-controlled MP identifiers', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);
      const mpRequest = source.slice(source.indexOf('const mpPreapprovalRequest'), source.indexOf('// Create preapproval in Mercado Pago'));

      expect(mpRequest).toMatch(/payer_email\s*:/);
      expect(mpRequest).toMatch(/back_url\s*:/);
      expect(mpRequest).toMatch(/external_reference\s*:/);
      expect(mpRequest).toMatch(/status\s*:\s*["']pending["']/);
      expect(mpRequest).toMatch(/auto_recurring\s*:/);
      expect(mpRequest).toMatch(/transaction_amount\s*:\s*Number\(plan\.price\)/);
      expect(mpRequest).not.toMatch(/preapproval_plan_id\s*:/);
      expect(mpRequest).not.toMatch(/card_token_id\s*:/);
      expect(source).toMatch(/fetch\([^\n]*\/preapproval/);
    });

    it('must resolve paid preapproval plan catalog server-side before creating paid subscriptions', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

      expect(source).toMatch(/\.from\(["']mp_plan_catalog["']\)/);
      expect(source).toMatch(/resolvePlanCatalogRow\(/);
      expect(source).toMatch(/PREAPPROVAL_PLAN_NOT_SYNCED/);
      expect(source).toMatch(/PLAN_CATALOG_READ_FAILED/);
    });

    it('must surface sanitized Mercado Pago upstream error diagnostics without sensitive fields', () => {
      const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);
      const mpErrorBranch = source.slice(source.indexOf('if (!mpResponse.ok)'), source.indexOf('const mpData = await mpResponse.json()'));

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

    it('must keep required secret env keys in server functions, not dashboard runtime', async () => {
      const env = await import('../../core/payments/subscriptions/mercadopago-subscription-env');
      const requiredKeys = (env as { REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS: readonly string[] })
        .REQUIRED_MERCADO_PAGO_SUBSCRIPTION_ENV_KEYS;
      const createSub = readRequiredFile(CREATE_SUBSCRIPTION_FN);
      const webhook = readRequiredFile(WEBHOOK_FN);

      expect(requiredKeys).toEqual(expect.arrayContaining(['MP_PREAPPROVAL_PLAN_ID', 'APP_BASE_URL']));
      expect(requiredKeys).not.toEqual(expect.arrayContaining(['MP_ACCESS_TOKEN', 'MP_WEBHOOK_SECRET']));
      expect(createSub).toMatch(/MP_ACCESS_TOKEN/);
      expect(webhook).toMatch(/MP_WEBHOOK_SECRET/);
    });
  });

  describe('Deployed workflow guardrail', () => {
    it('must include CI workflow that deploys both subscription functions', () => {
      const workflow = readRequiredFile(DEPLOY_WORKFLOW);

      expect(workflow).toMatch(/create-subscription/);
      expect(workflow).toMatch(/mercadopago-webhook/);
      expect(workflow).not.toMatch(/vercel\s+(deploy|pull|build)|vercel\/action/i);
    });
  });
});
