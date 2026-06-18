import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-account-page-controller.ts', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

function sliceBetween(source: string, startMarker: string, endMarker?: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = endMarker ? source.indexOf(endMarker, start + startMarker.length) : source.length;
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end);
}

describe('RED contract: landing owns signup onboarding boundary', () => {
  it('FREE credential signup continues to landing-owned onboarding and never redirects to dashboard /auth/onboarding', async () => {
    const controllerSource = await loadSource(CREDENTIALS_CONTROLLER_PATH);
    const freeBranch = sliceBetween(controllerSource, 'if (!isPaidPlan) {', 'return;\n    }');

    expect(freeBranch).not.toContain("new URL('/auth/onboarding'");
    expect(freeBranch).not.toContain('/auth/onboarding');
    expect(freeBranch).not.toContain('PUBLIC_DASHBOARD_URL');
    expect(freeBranch).not.toContain('dashboardOrigin');
    expect(freeBranch).toMatch(/landing.*onboarding|\/auth\/signup\/onboarding|signupResult\.redirectTo/i);
    expect(freeBranch).toMatch(/modal|welcome|login|auth\/login/i);
  });

  it('FREE signup completion page does not build dashboard onboarding as a fallback route', async () => {
    const completeSource = await loadSource(COMPLETE_PAGE_PATH);

    expect(completeSource).not.toContain('buildDashboardOnboardingUrl');
    expect(completeSource).not.toContain('/auth/onboarding');
    expect(completeSource).not.toContain('PUBLIC_DASHBOARD_URL');
    expect(completeSource).toMatch(/\/auth\/signup\/credentials|\/auth\/signup\/onboarding/i);
  });

  it('Mercado Pago return params are UX hints only and cannot complete onboarding/payment without backend state', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);
    const returnHandling = sliceBetween(subscriptionSource, "const paymentStatus =", 'const buildIdempotencyKey =');

    expect(returnHandling).toMatch(/UX only|query params are UX only|setUiState/i);
    expect(returnHandling).not.toMatch(/paymentStatus\s*===\s*['"]approved['"][\s\S]{0,400}window\.location\.href\s*=\s*handoffUrl/);
    expect(returnHandling).not.toMatch(/isApprovedReturn[\s\S]{0,400}window\.location\.href\s*=/);
    expect(returnHandling).toMatch(/fetch\(`?\/api\/subscriptions\/status|account_materialized|materialized|backend/i);
  });
});
