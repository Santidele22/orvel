import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const SIGNUP_CREDENTIALS_PAGE = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const SIGNUP_COMPLETE_PAGE = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const LEGACY_ONBOARDING_PAGE = new URL('../pages/auth/signup/onboarding.astro', import.meta.url);
const SUBSCRIPTION_PAGE = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API = new URL('../pages/api/subscriptions/start.ts', import.meta.url);

async function source(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function sliceBetween(sourceText: string, startMarker: string, endMarker?: string): string {
  const start = sourceText.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? sourceText.indexOf(endMarker, start + startMarker.length) : sourceText.length;
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return sourceText.slice(start, end);
}

describe('RED contract: payment-first signup happy path', () => {
  it('landing subscription start forwards the protected pending signup intent to Mercado Pago and does not require an existing account/business', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startSource = await source(SUBSCRIPTION_START_API);
    const combined = `${subscriptionSource}\n${startSource}`;

    expect(combined).toMatch(/pendingSignupIntent|pending_signup_intent|protected_pending_signup_intent/i);
    expect(startSource).toMatch(/type\s+SubscriptionMode\s*=\s*["']pending_signup_intent["']\s*\|\s*["']existing_user["']/);
    expect(startSource).toMatch(/const\s+mode\s*:\s*SubscriptionMode\s*=\s*pendingSignupIntent\s*\?\s*["']pending_signup_intent["']\s*:\s*["']existing_user["']/);
    expect(startSource).toMatch(/\bmode\s*,/);
    expect(startSource).toMatch(/pending_signup_intent\s*:/);
    expect(startSource, 'payment-first start must not use account-first intent/session fields').not.toMatch(/account_first|accountFirst/i);
    expect(startSource, 'pending signup payment start must not map missing business as an existing-user auth failure').not.toMatch(
      /business_required_existing|ACCOUNT_FIRST_BUSINESS_REQUIRED|account_first_signup/i,
    );
  });

  it('paid approved signup shows a welcome/login state after backend materialization instead of silently redirecting', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);

    const materializedBranch = sliceBetween(
      subscriptionSource,
      "if (normalizedStatus === 'approved' || normalizedStatus === 'active' || accountMaterialized)",
      "if (normalizedStatus === 'rejected' || normalizedStatus === 'failed')",
    );

    expect(subscriptionSource, 'paid signup must render an explicit welcome modal/state for approved materialized accounts').toMatch(
      /paidSignupWelcomeModal|subscriptionWelcomeModal|accountCreatedModal|welcome_login|Bienvenida|¡Bienvenida a Orvel!/i,
    );
    expect(materializedBranch, 'approved paid signup must set/show welcome UI before login handoff').toMatch(
      /setUiState\(['"]welcome['"]\)|show(?:Paid|Subscription)?Welcome|paidSignupWelcomeModal|subscriptionWelcomeModal|accountCreatedModal/i,
    );
    expect(materializedBranch, 'approved paid signup must not silently redirect to login before a welcome state is visible').not.toMatch(
      /window\.location\.href\s*=\s*handoffUrl\s*;\s*return\s*;/,
    );
  });

  it('legacy landing auth pages 302 into dashboard in-app signup instead of hosting the old happy path', async () => {
    const onboardingSource = await source(LEGACY_ONBOARDING_PAGE);
    const credentialsSource = await source(SIGNUP_CREDENTIALS_PAGE);
    const completeSource = await source(SIGNUP_COMPLETE_PAGE);

    for (const page of [onboardingSource, credentialsSource, completeSource]) {
      expect(page).toMatch(/buildInAppAuthRedirect/);
      expect(page).toMatch(/Astro\.redirect/);
      expect(page).not.toMatch(/accountCreatedModal|initSignupCredentialsPage/);
    }
  });
});
