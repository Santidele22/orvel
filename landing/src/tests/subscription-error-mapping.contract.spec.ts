import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: subscription canonical error mapping', () => {
  it('alias activation page no longer maps Mercado Pago start errors in the UI', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const markupBeforeScript = source.split('<script>')[0] ?? source;

    expect(source).not.toMatch(/normalizeSubscriptionErrorCode/);
    expect(source).not.toMatch(/\/api\/subscriptions\/start/);
    expect(markupBeforeScript).not.toMatch(/>[^<]*(?:backend|JWT|UNAUTHORIZED_INVALID_JWT_FORMAT)[^<]*</i);
  });

  it('keeps /api/subscriptions/start aligned with canonical contract errors', async () => {
    const source = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
    expect(source).toContain('fallbackReason');
    expect(source).toContain('BUSINESS_REQUIRED');
    expect(source).toContain('PENDING_SIGNUP_EMAIL_REQUIRED');
    expect(source).toContain('PENDING_SIGNUP_PII_INVALID');
    expect(source).toContain('EMAIL_REQUIRED');
  });

  it('maps pending signup 400 contract errors to friendly non-raw copy on the start API', async () => {
    const apiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(apiSource).toContain('PENDING_SIGNUP_EMAIL_REQUIRED');
    expect(apiSource).toContain('PENDING_SIGNUP_PII_INVALID');
    expect(apiSource).toContain('BUSINESS_REQUIRED');
  });

  it('keeps duplicate paid signup email responses generic/accepted without account enumeration copy', async () => {
    const apiSource = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(apiSource).toMatch(/signup_confirmation_requested|confirmation_requested|accepted|pending_signup_missing|ok\s*:\s*true/i);
    expect(apiSource).not.toMatch(/EMAIL_ALREADY_REGISTERED|Este email ya tiene una cuenta|Ya existe un alta paga pendiente/i);
  });
});

describe('Contract: subscription status and UI guardrails', () => {
  it('alias activation page does not poll Mercado Pago subscription status', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).not.toContain('pollSubscriptionStatus');
    expect(source).not.toContain('/api/subscriptions/status');
    expect(source).toContain('orvel.pagos');
    expect(source).toContain('https://wa.me/5492944667161');
  });
});
