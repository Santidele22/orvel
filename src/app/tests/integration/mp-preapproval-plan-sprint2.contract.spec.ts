import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const TEST_DIR = path.dirname(new URL(import.meta.url).pathname);
const ROOT = path.resolve(TEST_DIR, '../../../../..');
const WEBHOOK_FN = path.join(ROOT, 'supabase', 'functions', 'mercadopago-webhook', 'index.ts');
const BILLING_SQL = path.join(ROOT, 'supabase', 'migrations', '20260506_consolidated_billing.sql');
const LANDING_CHECKOUT_START_API = path.join(ROOT, 'landing', 'src', 'pages', 'api', 'checkout', 'start.ts');
const SUBSCRIPTION_STATUS_API = path.join(ROOT, 'landing', 'src', 'pages', 'api', 'subscriptions', 'status.ts');

function readRequiredFile(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('Sprint2 MP preapproval_plan QA gate contracts', () => {
  it('handles duplicate/reordered webhook events with idempotency before state transition side effects', () => {
    const webhook = readRequiredFile(WEBHOOK_FN);

    const existingEventRead = webhook.search(/\.from\("payment_webhook_events"\)[\s\S]*\.select\("id, processed_at, payload_hash"\)/m);
    const reserveEvent = webhook.search(/reserve_payment_webhook_event/);
    const duplicateProcessedDecision = webhook.search(/reservationDecision === "duplicate_processed"/);
    const payloadConflictDecision = webhook.search(/reservationDecision === "payload_conflict"/);
    const transitionRpc = webhook.search(/apply_subscription_event_transition/);

    expect(existingEventRead).toBeGreaterThan(-1);
    expect(reserveEvent).toBeGreaterThan(-1);
    expect(duplicateProcessedDecision).toBeGreaterThan(-1);
    expect(payloadConflictDecision).toBeGreaterThan(-1);
    expect(transitionRpc).toBeGreaterThan(-1);

    expect(existingEventRead).toBeLessThan(transitionRpc);
    expect(reserveEvent).toBeLessThan(transitionRpc);
    expect(duplicateProcessedDecision).toBeLessThan(transitionRpc);
    expect(payloadConflictDecision).toBeLessThan(transitionRpc);
  });

  it('blocks illegal subscription state transitions from terminal states', () => {
    const sql = readRequiredFile(BILLING_SQL);

    expect(sql).toMatch(/IF current_sub\.status IN \('canceled', 'cancelled', 'expired'\) THEN RAISE EXCEPTION 'terminal subscription cannot transition from %'/);
    expect(sql).toMatch(/illegal transition from % to %/);
    expect(sql).toMatch(/unsupported subscription next status %/);
  });

  it('enforces server-truth next_status as transition source-of-truth', () => {
    const sql = readRequiredFile(BILLING_SQL);
    const webhook = readRequiredFile(WEBHOOK_FN);

    expect(sql).toMatch(/canonical_next_status := lower\(trim\(COALESCE\(p_next_status, ''\)\)\)/);
    expect(sql).toMatch(/IF canonical_next_status = 'cancelled' THEN canonical_next_status := 'canceled'; END IF;/);

    expect(webhook).toMatch(/const STATUS_MAP:[\s\S]*authorized:\s*"active"/m);
    expect(webhook).toMatch(/const STATUS_MAP:[\s\S]*paused:\s*"paused"/m);
    expect(webhook).toMatch(/const STATUS_MAP:[\s\S]*cancelled:\s*"canceled"/m);
    expect(webhook).toMatch(/p_next_status:\s*internalStatus/);
    expect(webhook).toMatch(/p_event_type:\s*eventAction/);
  });

  it('allows generic event action while canceled server-truth still cancels subscription', () => {
    const sql = readRequiredFile(BILLING_SQL);

    expect(sql).toMatch(/canonical_next_status := lower\(trim\(COALESCE\(p_next_status, ''\)\)\)/);
    expect(sql).toMatch(/SET status = canonical_next_status/);
    expect(sql).toMatch(/event_type, occurred_at, payload_hash, transition_action, previous_status, next_status/);
    expect(sql).toMatch(/VALUES \([\s\S]*p_event_type,[\s\S]*canonical_action,[\s\S]*updated_sub\.status/m);
  });

  it('verifies status read endpoint contract when introduced', () => {
    if (!fs.existsSync(SUBSCRIPTION_STATUS_API)) {
      const checkoutStartApi = readRequiredFile(LANDING_CHECKOUT_START_API);
      expect(checkoutStartApi).toContain('/functions/v1/create-subscription');
      return;
    }

    const statusApi = readRequiredFile(SUBSCRIPTION_STATUS_API);
    expect(statusApi).toMatch(/export const GET\s*:\s*APIRoute/);
    expect(statusApi).toMatch(/status/i);
    expect(statusApi).toMatch(/subscription/i);
  });
});
