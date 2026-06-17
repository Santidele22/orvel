import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: subscription canonical error mapping', () => {
  it('maps canonical backend error codes in subscription UI dictionary', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).toContain('BUSINESS_REQUIRED');
    expect(source).toContain('EMAIL_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
    expect(source).toContain('normalizeSubscriptionErrorCode');
  });

  it('maps Supabase gateway INVALID_JWT_FORMAT to friendly retry copy without raw backend/JWT wording', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).toContain('UNAUTHORIZED_INVALID_JWT_FORMAT');
    expect(source).toContain('No pudimos iniciar la suscripción. Reintentá en unos segundos.');
    expect(source).not.toContain('|| codeOrMessage');
    expect(source).not.toMatch(/UNAUTHORIZED_INVALID_JWT_FORMAT['"]:\s*['"][^'"]*(?:backend|JWT|UNAUTHORIZED_INVALID_JWT_FORMAT)/i);
  });

  it('keeps subscription error copy user-friendly and announces it as an alert region', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const markupBeforeScript = source.split('<script>')[0] ?? source;

    expect(markupBeforeScript).not.toMatch(/>[^<]*(?:backend|JWT|UNAUTHORIZED_INVALID_JWT_FORMAT)[^<]*</i);
    expect(markupBeforeScript).toMatch(/id="subscriptionError"[^>]*role="alert"/);
    expect(markupBeforeScript).toMatch(/id="subscriptionError"[^>]*aria-live="polite"/);
  });

  it('keeps /api/subscriptions/start aligned with canonical contract errors', async () => {
    const source = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
    expect(source).toContain('fallbackReason');
    expect(source).toContain('BUSINESS_REQUIRED');
    expect(source).toContain('EMAIL_REQUIRED');
  });
});

describe('Contract: subscription status and UI guardrails', () => {
  it('keeps pending polling behavior for subscription_session_id status updates', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).toContain('pollSubscriptionStatus');
    expect(source).toContain('pollingIntervalId = window.setInterval(pollSubscriptionStatus, 4000)');
    expect(source).toContain('MAX_POLLING_ATTEMPTS');
    expect(source).toContain('stopSubscriptionPolling');
    expect(source).toContain("setUiState('pending')");
  });

  it('redirects only on approved/active status from polling', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).toContain("normalizedStatus === 'approved' || normalizedStatus === 'active'");
    expect(source).toContain('window.location.href = handoffUrl');
  });

  it('renders non-active UI states for failed/cancelled and preserves retry path', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).toContain("setUiState('failed')");
    expect(source).toContain("setUiState('cancelled')");
    expect(source).toContain("setUiState('retry')");
    expect(source).toContain('TERMINAL_NON_SUCCESS_STATES');
    expect(source).toContain('setSubscriptionButtonDisabled(false)');
    expect(source).toContain('showSubscriptionError');
  });
});
