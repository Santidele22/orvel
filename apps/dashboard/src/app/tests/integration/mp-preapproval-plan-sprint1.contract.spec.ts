import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = findRepoRoot(TEST_DIR);
const CREATE_SUBSCRIPTION_FN = path.join(ROOT, 'supabase', 'functions', 'create-subscription', 'index.ts');
const WEBHOOK_FN = path.join(ROOT, 'supabase', 'functions', 'mercadopago-webhook', 'index.ts');
const SPRINT1_MIGRATION = findSprint1Migration(ROOT);

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

function findSprint1Migration(root: string): string {
  const migrationsDir = path.join(root, 'supabase', 'migrations');
  const migrationFile = fs
    .readdirSync(migrationsDir)
    .find((fileName) => /^20260508000000_mp_preapproval_plan_sprint1\.sql$/.test(fileName));

  if (!migrationFile) {
    throw new Error('Missing Sprint1 MP preapproval migration: 20260508000000_mp_preapproval_plan_sprint1.sql');
  }

  return path.join(migrationsDir, migrationFile);
}

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Sprint1 MP preapproval_plan validation contracts', () => {
  it('supports create-subscription on the canonical FREE/PREMIUM model and keeps legacy plan_code normalization', () => {
    const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

    expect(source).toMatch(/interface\s+SubscriptionRequest\s*\{[\s\S]*tier\?\s*:\s*string\s*;[\s\S]*cadence\?\s*:\s*string\s*;/m);
    expect(source).toMatch(/const canonicalPlanCode = normalizeCanonicalPlanCode\(effectivePlanCode\)/);
    expect(source).toMatch(/canonicalPlanCode === ["']PREMIUM["']/);
    expect(source).toMatch(/effectivePlanCode\s*=\s*["']PREMIUM["']/);
    expect(source).not.toMatch(/effectivePlanCode\s*=\s*normalizedTier\s*===\s*["']starter["'][\s\S]*["']STARTER["'][\s\S]*["']GROWTH["'][\s\S]*["']PRO["']/m);
    expect(source).toMatch(/PLAN_CODE_REQUIRED/);
  });

  it('requires manual Premium monthly preapproval plan configuration when mp_plan_catalog lacks preapproval_plan_id', () => {
    const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

    expect(source).toMatch(/PLAN_CATALOG_READ_FAILED/);
    expect(source).toMatch(/PREAPPROVAL_PLAN_MANUAL_CONFIGURATION_REQUIRED/);
    expect(source).not.toMatch(/PREAPPROVAL_PLAN_NOT_SYNCED/);
    expect(source).toMatch(/preapproval_plan_id/);
  });

  it('persists secure external references in checkout sessions and MP ids on pending subscription insert', () => {
    const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

    expect(source).toMatch(/\.from\(["']billing_checkout_sessions["']\)[\s\S]*\.insert\(\{[\s\S]*external_reference\s*:\s*externalReference[\s\S]*token_hash\s*:\s*await sha256Text\(subscriptionSessionToken\)[\s\S]*\}\)/m);
    expect(source).toMatch(/\.from\(["']business_subscriptions["']\)[\s\S]*\.insert\(\{[\s\S]*provider_subscription_id\s*:\s*mpData\.id[\s\S]*mp_preapproval_id\s*:\s*mpData\.id[\s\S]*\}\)/m);
    expect(source).toMatch(/external_reference\s*:\s*externalReference/);
  });

  it('defines migration contracts for mp_plan_catalog and new business_subscriptions columns/indexes', () => {
    const sql = readRequiredFile(SPRINT1_MIGRATION);

    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.mp_plan_catalog/);
    expect(sql).toMatch(/UNIQUE \(tier, cadence\)/);
    expect(sql).toMatch(/UNIQUE \(tier_code\)/);
    expect(sql).toMatch(/UNIQUE \(preapproval_plan_id\)/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS mp_plan_catalog_lookup_idx/);

    expect(sql).toMatch(/ALTER TABLE public\.business_subscriptions[\s\S]*ADD COLUMN IF NOT EXISTS mp_plan_catalog_id/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS mp_external_reference/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS mp_init_point/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS mp_preapproval_plan_id/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS business_subscriptions_mp_reference_idx/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS business_subscriptions_mp_preapproval_idx/);
  });

  it('keeps webhook idempotency on payment_webhook_events without legacy dual writes', () => {
    const source = readRequiredFile(WEBHOOK_FN);

    const readExisting = source.search(/\.from\((?:"payment_webhook_events"|PAYMENT_WEBHOOK_EVENTS_TABLE)\)[\s\S]*\.select\("id, processed_at, payload_hash"\)/m);
    const canonicalUpsert = source.search(/\.from\("payment_webhook_events"\)[\s\S]*\.upsert\([\s\S]*provider_event_id[\s\S]*payload_hash/m);
    const subscriptionPaymentUpsert = source.search(/upsertSubscriptionPayment[\s\S]*providerPaymentId:\s*resourceId/m);
    const reserveRpc = source.search(/reserve_payment_webhook_event/);
    const transitionRpc = source.search(/apply_subscription_event_transition/);

    expect(readExisting).toBeGreaterThan(-1);
    expect(canonicalUpsert).toBeGreaterThan(-1);
    expect(subscriptionPaymentUpsert).toBeGreaterThan(-1);
    expect(source).toMatch(/subscription_payment_upsert_failed/);
    expect(reserveRpc).toBeGreaterThan(-1);
    expect(transitionRpc).toBeGreaterThan(-1);
    expect(source).not.toMatch(/\.from\("mp_webhook_events"\)[\s\S]*\.(?:insert|upsert|update)\(/m);
    expect(source).not.toMatch(/\.from\("payments"\)[\s\S]*\.(?:insert|upsert|update)\(/m);
    expect(readExisting).toBeLessThan(transitionRpc);
    expect(canonicalUpsert).toBeLessThan(transitionRpc);
    expect(reserveRpc).toBeLessThan(transitionRpc);
  });

  it('must not log raw Mercado Pago upstream error body (sensitive logging guard)', () => {
    const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);

    expect(source).not.toMatch(/\[MP RAW ERROR BODY\]/);
    expect(source).not.toMatch(/console\.log\([^\n]*errorText\)/);
  });
});
