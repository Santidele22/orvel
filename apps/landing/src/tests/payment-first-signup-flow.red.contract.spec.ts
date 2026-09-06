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

describe('RED contract: payment-first signup happy path', () => {
  it('landing subscription activation uses alias + WhatsApp instead of Mercado Pago checkout', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);
    const startSource = await source(SUBSCRIPTION_START_API);

    expect(subscriptionSource).not.toMatch(/\/api\/subscriptions\/start/);
    expect(subscriptionSource).not.toMatch(/init_point/);
    expect(subscriptionSource).not.toMatch(/Mercado Pago/i);
    expect(subscriptionSource).toContain('orvel.pagos');
    expect(subscriptionSource).toContain('https://wa.me/5492944667161');
    expect(startSource).toMatch(/type\s+SubscriptionMode\s*=\s*["']pending_signup_intent["']\s*\|\s*["']existing_user["']/);
    expect(startSource, 'payment-first start must not use account-first intent/session fields').not.toMatch(/account_first|accountFirst/i);
  });

  it('paid activation page does not wait on Mercado Pago materialization before the operator can stay on Gratis', async () => {
    const subscriptionSource = await source(SUBSCRIPTION_PAGE);

    expect(subscriptionSource).toContain('Entrá ya en Gratis, sin esperar a nadie.');
    expect(subscriptionSource).not.toMatch(/pollSubscriptionStatus/);
    expect(subscriptionSource).not.toMatch(/window\.location\.href\s*=\s*handoffUrl/);
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
