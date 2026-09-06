import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('RED contract: landing owns signup onboarding boundary', () => {
  it('FREE signup completion page 302s into dashboard in-app signup instead of dashboard /auth/onboarding', async () => {
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);

    expect(completeSource).toMatch(/buildInAppAuthRedirect/);
    expect(completeSource).toMatch(/Astro\.redirect/);
    expect(completeSource).not.toContain('buildDashboardOnboardingUrl');
    expect(completeSource).not.toContain('/auth/onboarding');
  });

  it('alias activation cannot grant Premium from Mercado Pago return params', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(subscriptionSource).not.toMatch(/paymentStatus\s*===\s*['"]approved['"][\s\S]{0,400}window\.location\.href/);
    expect(subscriptionSource).not.toMatch(/init_point/);
    expect(subscriptionSource).toContain('plan Gratis');
  });
});
