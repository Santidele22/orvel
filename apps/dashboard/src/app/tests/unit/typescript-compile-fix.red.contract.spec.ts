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

  it('dashboard notification sender must queue outbox rows without provider secrets', () => {
    const source = readSource(NOTIFICATION_SENDER_PATH);

    expect(source).toMatch(/notification_email_outbox/);
    expect(source).toMatch(/to_email/);
    expect(source).not.toMatch(/SENDGRID_API_KEY|MAILTRAP_TOKEN|MAILTRAP_API_KEY|apiKey\s*:/);
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
