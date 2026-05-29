import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CHECKOUT_PAGE_PATH = new URL('../pages/billing/test-checkout.astro', import.meta.url);
const CHECKOUT_START_API_PATH = new URL('../pages/api/checkout/start.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: checkout canonical error mapping', () => {
  it('maps canonical backend error codes in checkout UI dictionary', async () => {
    const source = await loadSource(CHECKOUT_PAGE_PATH);

    expect(source).toContain('BUSINESS_REQUIRED');
    expect(source).toContain('EMAIL_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
    expect(source).toContain('normalizeCheckoutErrorCode');
  });

  it('keeps /api/checkout/start aligned with canonical contract errors', async () => {
    const source = await loadSource(CHECKOUT_START_API_PATH);

    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
    expect(source).toContain('fallbackReason');
    expect(source).toContain('BUSINESS_REQUIRED');
    expect(source).toContain('EMAIL_REQUIRED');
  });
});

describe('Contract: checkout status and UI guardrails', () => {
  it('keeps pending polling behavior for checkout_session_id status updates', async () => {
    const source = await loadSource(CHECKOUT_PAGE_PATH);

    expect(source).toContain('pollCheckoutStatus');
    expect(source).toContain('window.setInterval(pollCheckoutStatus, 4000)');
    expect(source).toContain("setUiState('pending')");
  });

  it('redirects only on approved/active status from polling', async () => {
    const source = await loadSource(CHECKOUT_PAGE_PATH);

    expect(source).toContain("normalizedStatus === 'approved' || normalizedStatus === 'active'");
    expect(source).toContain('window.location.href = dashboardHome');
  });

  it('renders non-active UI states for failed/cancelled and preserves retry path', async () => {
    const source = await loadSource(CHECKOUT_PAGE_PATH);

    expect(source).toContain("setUiState('failed')");
    expect(source).toContain("setUiState('cancelled')");
    expect(source).toContain("setUiState('retry')");
    expect(source).toContain('showCheckoutError');
  });
});
