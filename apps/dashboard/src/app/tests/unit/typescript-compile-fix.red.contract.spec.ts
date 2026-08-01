import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const ACCOUNT_PLAN_POLICY_PATH = path.join(ROOT, 'src', 'app', 'core', 'accounts', 'account-plan-policy.ts');
const NOTIFICATION_SENDER_PATH = path.join(ROOT, 'src', 'app', 'core', 'notifications', 'notification-sender.ts');
const CREATE_SUBSCRIPTION_API_PATH = path.join(
  ROOT,
  'src',
  'app',
  'core',
  'payments',
  'subscriptions',
  'create-subscription.api.ts'
);
const CREATE_SUBSCRIPTION_IMPLEMENTATION_PATH = path.join(
  ROOT,
  'src',
  'app',
  'features',
  'billing',
  'data-access',
  'payments',
  'subscriptions',
  'create-subscription.api.ts'
);

function readSource(filePath: string): string {
  expect(fs.existsSync(filePath), `Missing file: ${path.relative(ROOT, filePath)}`).toBe(true);
  return fs.readFileSync(filePath, 'utf8');
}

describe('TypeScript compile-fix RED contracts (type-safe handling only)', () => {
  it('account plan policy must avoid indexing PREMIUM_MAX_SALONS with non-premium union keys', () => {
    const source = readSource(ACCOUNT_PLAN_POLICY_PATH);

    expect(source).not.toMatch(/PREMIUM_MAX_SALONS\[planCode\]/);
    expect(source).toMatch(/resolvePlanCodeFromCatalog/);
    expect(source).toMatch(/getPlanEntitlementsFromCatalog/);
    expect(source).not.toMatch(/Exclude<PlanCode/);
  });

  it('removes the dashboard-side notification sender boundary (Phase 2 dropped notification_email_outbox)', () => {
    // Phase 2 (release 2.0) removed notification-sender.ts; the legacy dashboard-side outbox
    // boundary no longer exists. The file path is intentionally unused now, but is retained
    // as a constant for historical traceability.
    expect(
      fs.existsSync(NOTIFICATION_SENDER_PATH),
      'notification-sender.ts was removed in Phase 2 (release 2.0); the dashboard must not own a notification_email_outbox boundary.',
    ).toBe(false);
  });

  it('createSubscription must narrow response union before reading server error code', () => {
    const entrypoint = readSource(CREATE_SUBSCRIPTION_API_PATH);
    const source = entrypoint.includes('export * from')
      ? readSource(CREATE_SUBSCRIPTION_IMPLEMENTATION_PATH)
      : entrypoint;

    expect(source).not.toMatch(/payload\?\.error/);
    expect(source).toMatch(/isCreateSubscriptionSuccess\(payload\)/);
    expect(source).toMatch(/failurePayload\?\.error/);
  });
});
