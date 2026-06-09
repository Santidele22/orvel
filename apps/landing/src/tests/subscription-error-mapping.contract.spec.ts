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
    expect(source).toContain('window.setInterval(pollSubscriptionStatus, 4000)');
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
    expect(source).toContain('showSubscriptionError');
  });
});
