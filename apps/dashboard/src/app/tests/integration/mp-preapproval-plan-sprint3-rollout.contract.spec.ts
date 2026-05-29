import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(TEST_DIR, '../../../../..');
const CREATE_SUBSCRIPTION_FN = path.join(ROOT, 'supabase', 'functions', 'create-subscription', 'index.ts');
const WEBHOOK_FN = path.join(ROOT, 'supabase', 'functions', 'mercadopago-webhook', 'index.ts');
const ROLLOUT_CONTROL = path.join(ROOT, 'supabase', 'functions', '_shared', 'mp-rollout-control.ts');
const OBSERVABILITY = path.join(ROOT, 'supabase', 'functions', '_shared', 'mp-rollout-observability.ts');
const ROLLOUT_SCRIPT = path.join(ROOT, 'scripts', 'rollout', 'mp-preapproval-plan-rollout.sh');
const ROLLBACK_SCRIPT = path.join(ROOT, 'scripts', 'rollout', 'mp-preapproval-plan-rollback.sh');

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Sprint3 MP preapproval_plan production rollout controls contracts', () => {
  it('implements deterministic sticky rollout assignment with 10/50/100 and 0 rollback support', () => {
    const control = readRequiredFile(ROLLOUT_CONTROL);

    expect(control).toMatch(/MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT/);
    expect(control).toMatch(/normalizeRolloutPercent/);
    expect(control).toMatch(/0,\s*10,\s*50,\s*100/);
    expect(control).toMatch(/computeStableBucket/);
    expect(control).toMatch(/tenantId:userId/);
    expect(control).toMatch(/allowed:\s*bucket\s*<\s*rolloutPercent/);
    expect(control).toMatch(/return\s*\{\s*value:\s*0,\s*valid:\s*false\s*\}/);
    expect(control).toMatch(/security_rollout_config_invalid/);
  });

  it('enforces runtime rollback path in create-subscription via traffic gate before MP call', () => {
    const source = readRequiredFile(CREATE_SUBSCRIPTION_FN);
    const gateIdx = source.search(/evaluatePreapprovalPlanRollout\(/m);
    const mpCallIdx = source.search(/fetch\(`\$\{MP_API_BASE\}\/preapproval`/m);

    expect(gateIdx).toBeGreaterThan(-1);
    expect(mpCallIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(mpCallIdx);
    expect(source).toMatch(/ROLLOUT_BLOCKED/);
  });

  it('adds canary observability instrumentation for success/error/latency and idempotency-retry signals', () => {
    const obs = readRequiredFile(OBSERVABILITY);
    const createSubscription = readRequiredFile(CREATE_SUBSCRIPTION_FN);
    const webhook = readRequiredFile(WEBHOOK_FN);

    expect(obs).toMatch(/metric:\s*'mp_preapproval_create_result'/);
    expect(obs).toMatch(/metric:\s*'mp_webhook_process_result'/);
    expect(obs).toMatch(/latency_ms/);
    expect(obs).toMatch(/latency_bucket/);
    expect(obs).toMatch(/idempotency_decision/);
    expect(obs).toMatch(/retryable/);
    expect(obs).toMatch(/actor_correlation_id/);
    expect(obs).not.toMatch(/user_id/);

    expect(createSubscription).toMatch(/recordPreapprovalCreateMetric/);
    expect(webhook).toMatch(/recordWebhookProcessMetric/);
  });

  it('provides executable rollout/rollback drill scripts', () => {
    const rollout = readRequiredFile(ROLLOUT_SCRIPT);
    const rollback = readRequiredFile(ROLLBACK_SCRIPT);

    expect(rollout).toMatch(/10\|50\|100/);
    expect(rollout).toMatch(/supabase secrets set MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT/);
    expect(rollback).toMatch(/50\|10\|0/);
    expect(rollback).toMatch(/supabase secrets set MP_PREAPPROVAL_PLAN_ROLLOUT_PERCENT/);
  });
});
