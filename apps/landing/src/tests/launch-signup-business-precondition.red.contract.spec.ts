import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-credentials-page-controller.ts', import.meta.url);
const BUSINESS_TYPE_PAGE_PATH = new URL('../pages/auth/signup/business-type.astro', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);

const WRONG_DASHBOARD_PRECONDITION =
  'Primero necesitás completar la configuración de tu negocio en el dashboard.';

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: launch landing signup must not apply dashboard business precondition', () => {
  it('launch plan CTAs keep new users inside canonical signup before any subscription/dashboard handoff', async () => {
    const source = `${await loadSource(PLAN_CARD_PATH)}\n${await loadSource(PLAN_CARDS_PATH)}`;

    expect(source).toContain('/auth/signup/credentials?plan=');
    expect(source).not.toContain('/api/subscriptions/start');
    expect(source).toMatch(/hasPendingCredentialsFirst|pending_signup/i);
  });

  it('credentials step delegates to the credentials-first controller, not legacy business-type routing', async () => {
    const source = `${await loadSource(CREDENTIALS_PAGE_PATH)}\n${await loadSource(CREDENTIALS_CONTROLLER_PATH)}`;

    expect(source).toContain('initSignupCredentialsPage');
    expect(source).toMatch(/createProtectedPendingSignupIntent|protected_pending_signup_intent|pendingSignupIntent/i);
    expect(source).toContain("new URL('/auth/signup/onboarding'");
    expect(source).toContain("onboardingUrl.searchParams.set('plan', plan)");
    expect(source).not.toContain('/auth/signup/business-type?plan=');
    expect(source).not.toContain(WRONG_DASHBOARD_PRECONDITION);
    expect(source).not.toContain('/dashboard/inicio');
  });

  it('legacy business-type bridge is absent from the current credentials-first signup contract', async () => {
    expect(existsSync(BUSINESS_TYPE_PAGE_PATH), 'business-type signup page is stale; current signup is credentials-first plus onboarding.').toBe(false);

    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    expect(completeSource).toContain('/auth/signup/credentials');
    expect(completeSource).not.toContain('/auth/signup/business-type');
  });

  it('manual launch signup creates/authenticates immediately only for free plans and defers paid account creation until payment', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);

    const protectedIntentIndex = credentialsSource.indexOf('createProtectedPendingSignupIntent');
    const signupAdapterIndex = credentialsSource.indexOf('createSupabaseSignupAdapterFromEnv');
    const signupWithProviderIndex = credentialsSource.indexOf('await signupWithProvider({');
    const paidDeferralIndex = credentialsSource.indexOf('/billing/subscription?plan=');

    expect(protectedIntentIndex, 'paid credentials-first flow must protect PII before payment').toBeGreaterThan(-1);
    expect(paidDeferralIndex, 'paid plans must defer account materialization until payment').toBeGreaterThan(-1);
    expect(signupAdapterIndex, 'credentials step must build the canonical landing signup adapter for free accounts').toBeGreaterThan(-1);
    expect(signupWithProviderIndex, 'credentials step must create/authenticate free accounts without storing passwords').toBeGreaterThan(-1);
    expect(signupAdapterIndex).toBeLessThan(signupWithProviderIndex);
    expect(completeSource).not.toContain(WRONG_DASHBOARD_PRECONDITION);
  });

  it('subscription fallback does not tell a new launch signup to complete business setup in the dashboard', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).not.toContain(WRONG_DASHBOARD_PRECONDITION);
  });
});
