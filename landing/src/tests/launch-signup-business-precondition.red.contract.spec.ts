import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const PLAN_CARD_PATH = new URL('../components/molecules/PlanCard.astro', import.meta.url);
const PLAN_CARDS_PATH = new URL('../components/organisms/SignupPlanCards.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
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

  it('credentials and complete pages 302 into dashboard in-app signup', async () => {
    const credentials = await loadSource(CREDENTIALS_PAGE_PATH);
    const complete = await loadSource(COMPLETE_PAGE_PATH);

    for (const page of [credentials, complete]) {
      expect(page).toMatch(/buildInAppAuthRedirect/);
      expect(page).toMatch(/Astro\.redirect/);
      expect(page).not.toContain('initSignupCredentialsPage');
      expect(page).not.toContain(WRONG_DASHBOARD_PRECONDITION);
    }
  });

  it('legacy business-type bridge is absent from the current credentials-first signup contract', async () => {
    expect(existsSync(BUSINESS_TYPE_PAGE_PATH), 'business-type signup page is stale; current signup is credentials-first plus onboarding.').toBe(false);

    const completeSource = await loadSource(COMPLETE_PAGE_PATH);
    expect(completeSource).not.toContain('/auth/signup/business-type');
  });

  it('subscription fallback does not tell a new launch signup to complete business setup in the dashboard', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).not.toContain(WRONG_DASHBOARD_PRECONDITION);
  });
});
