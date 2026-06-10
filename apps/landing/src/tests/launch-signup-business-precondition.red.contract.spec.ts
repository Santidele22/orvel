import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const BUSINESS_TYPE_PAGE_PATH = new URL('../pages/auth/signup/business-type.astro', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const OAUTH_ONBOARDING_FLOW_PATH = new URL('../lib/oauth-signup-onboarding-flow.ts', import.meta.url);

const WRONG_DASHBOARD_PRECONDITION =
  'Primero necesitás completar la configuración de tu negocio en el dashboard.';

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: launch landing signup must not apply dashboard business precondition', () => {
  it('launch plan CTAs keep new users inside canonical signup before any subscription/dashboard handoff', async () => {
    const source = `${await loadSource(PLAN_CARD_PATH)}\n${await loadSource(PLAN_CARDS_PATH)}`;

    expect(source).toContain('/auth/signup/credentials?plan=');
    expect(source).not.toContain('/billing/subscription?plan=');
    expect(source).not.toContain('/api/subscriptions/start');
  });

  it('credentials step routes new account creation to business-type onboarding, not to dashboard or billing', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);

    expect(source).toContain('/auth/signup/business-type?plan=');
    expect(source).not.toContain(WRONG_DASHBOARD_PRECONDITION);
    expect(source).not.toContain('/dashboard/inicio');
    expect(source).not.toContain('/billing/subscription?plan=');
  });

  it('business-type bridge preserves launch signup context until the onboarding completion step', async () => {
    const source = `${await loadSource(BUSINESS_TYPE_PAGE_PATH)}\n${await loadSource(OAUTH_ONBOARDING_FLOW_PATH)}`;

    expect(source).toContain('buildBusinessTypeCompletionRedirect');
    expect(source).toContain('/auth/signup/complete');
    expect(source).not.toContain(WRONG_DASHBOARD_PRECONDITION);
    expect(source).not.toContain('/dashboard/inicio');
    expect(source).not.toContain('/billing/subscription?plan=');
  });

  it('manual launch signup creates/authenticates immediately only for free plans and defers paid account creation until payment', async () => {
    const credentialsSource = await loadSource(CREDENTIALS_PAGE_PATH);
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    const credentialsSubmitStart = credentialsSource.indexOf("form.addEventListener('submit'");
    const credentialsSubmitFlow = credentialsSource.slice(credentialsSubmitStart);
    const manualFlowStart = completeSource.indexOf('// Manual Signup Flow');
    const manualFlow = completeSource.slice(manualFlowStart);

    const paidDeferralIndex = manualFlow.indexOf('if (isPaidPlan)');
    const signupAdapterIndex = credentialsSubmitFlow.indexOf('createSupabaseSignupAdapterFromEnv');
    const signupWithProviderIndex = credentialsSubmitFlow.indexOf('await signupWithProvider({');
    const dashboardHandoffIndex = manualFlow.indexOf('window.location.href = dashboardSignupUrl');

    expect(credentialsSubmitStart).toBeGreaterThan(-1);
    expect(manualFlowStart).toBeGreaterThan(-1);
    expect(paidDeferralIndex, 'paid plans must branch into pending payment before creating Supabase auth').toBeGreaterThan(-1);
    expect(signupAdapterIndex, 'credentials step must build the canonical landing signup adapter for free accounts').toBeGreaterThan(-1);
    expect(signupWithProviderIndex, 'credentials step must create/authenticate free accounts without storing passwords').toBeGreaterThan(-1);
    expect(signupAdapterIndex).toBeLessThan(signupWithProviderIndex);
    expect(dashboardHandoffIndex).toBeGreaterThan(-1);
    expect(completeSource).not.toContain(WRONG_DASHBOARD_PRECONDITION);
  });

  it('subscription fallback does not tell a new launch signup to complete business setup in the dashboard', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).not.toContain(WRONG_DASHBOARD_PRECONDITION);
  });
});
