import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

const ACCOUNT_PLAN_POLICY_PATH = path.join(ROOT, 'src', 'app', 'core', 'accounts', 'account-plan-policy.ts');
const SENDGRID_ENV_PATH = path.join(ROOT, 'src', 'app', 'core', 'notifications', 'sendgrid-env.ts');
const CREATE_SUBSCRIPTION_API_PATH = path.join(
  ROOT,
  'src',
  'app',
  'core',
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
    expect(source).toMatch(/Exclude<PlanCode,\s*'FREE'\s*\|\s*'BASIC'\s*\|\s*'MEDIUM'>/);
  });

  it('sendgrid env loader must read index-signature env keys with bracket notation', () => {
    const source = readSource(SENDGRID_ENV_PATH);

    expect(source).toMatch(/source\[['"]SENDGRID_API_KEY['"]\]/);
    expect(source).toMatch(/source\[['"]SENDGRID_FROM_EMAIL['"]\]/);
    expect(source).not.toMatch(/source\.SENDGRID_API_KEY/);
    expect(source).not.toMatch(/source\.SENDGRID_FROM_EMAIL/);
  });

  it('createSubscription must narrow response union before reading server error code', () => {
    const source = readSource(CREATE_SUBSCRIPTION_API_PATH);

    expect(source).not.toMatch(/payload\?\.error/);
    expect(source).toMatch(/'error'\s+in\s+payload|payload\s*&&\s*!payload\.success/);
  });
});
