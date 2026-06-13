import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const LANDING_INDEX_PATH = new URL('../pages/index.astro', import.meta.url);
const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/credentials.astro', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const OAUTH_ONBOARDING_FLOW_PATH = new URL('../lib/oauth-signup-onboarding-flow.ts', import.meta.url);
const CREATE_SUBSCRIPTION_FN_PATH = new URL('../../../../supabase/functions/create-subscription/index.ts', import.meta.url);
const MP_WEBHOOK_FN_PATH = new URL('../../../../supabase/functions/mercadopago-webhook/index.ts', import.meta.url);

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

describe('Contract: simplified launch signup flow', () => {
  it('landing signup has no business-type/service selector before auth or Mercado Pago', async () => {
    const landingSignupSources = [
      await loadSource(LANDING_INDEX_PATH),
      await loadSource(PLAN_PAGE_PATH),
      await loadSource(CREDENTIALS_PAGE_PATH),
      await loadSource(COMPLETE_PAGE_PATH)
    ].join('\n');

    expect(landingSignupSources).not.toContain('/auth/signup/business-type');
    expect(landingSignupSources).not.toMatch(/name=["'](?:rubro|business_type|service_type|tipoNegocio)["']/i);
    expect(landingSignupSources).not.toMatch(/Seleccion[aá].*(categor[ií]as|rubro|servicio|tipo de negocio)/i);
  });

  it('Google OAuth signup completion no longer routes through the legacy landing business-type step', async () => {
    const oauthSource = await loadSource(OAUTH_ONBOARDING_FLOW_PATH);

    expect(oauthSource).not.toContain('/auth/signup/business-type');
    expect(oauthSource).not.toMatch(/BusinessTypeCompletion|completeOAuthBusinessType|business type selection/i);
    expect(oauthSource).toContain('/auth/signup/complete');
  });

  it('paid pending signup payload treats business_type as optional legacy data and only requires email before payment', async () => {
    const startApiSource = await loadSource(SUBSCRIPTION_START_API_PATH);
    const createSubscriptionSource = await loadSource(CREATE_SUBSCRIPTION_FN_PATH);

    expect(startApiSource).toMatch(/pendingSignupIntent|pending_signup_intent|pending_signup/i);
    expect(startApiSource).toContain('email,');
    expect(startApiSource).toMatch(/business_type:\s*businessType/);
    expect(createSubscriptionSource).not.toMatch(/!pendingSignupEmail\s*\|\|\s*!pendingSignupBusinessType/);
    expect(createSubscriptionSource).not.toContain('PENDING_SIGNUP_BUSINESS_REQUIRED');
  });

  it('Mercado Pago approval materializes paid account but keeps onboarding incomplete until dashboard onboarding RPC', async () => {
    const webhookSource = await loadSource(MP_WEBHOOK_FN_PATH);
    const materializeBody = sliceBetween(webhookSource, 'async function materializePendingSignup', '// Verify payment status');

    expect(materializeBody).toMatch(/auth\.admin\.createUser|pending_signup/i);
    expect(materializeBody).toMatch(/onboarding_required\s*:\s*true|onboarding_completed\s*:\s*false|onboardingCompleted\s*:\s*false/);
    expect(materializeBody).not.toMatch(/onboarding_completed\s*:\s*true|onboardingCompleted\s*:\s*true/);
    expect(materializeBody).not.toMatch(/dashboard_ready_at\s*:|current_step\s*:\s*['"]dashboard_ready['"]/);
  });

  it('paid subscription polling routes materialized accounts through dashboard auth handoff instead of dashboard home', async () => {
    const subscriptionSource = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(subscriptionSource).toMatch(/materialized|account_materialized/i);
    // Approved/materialized paid accounts now use the canonical dashboard /auth handoff;
    // dashboard-side guards remain responsible for requiring configuration onboarding.
    expect(subscriptionSource).toContain('buildDashboardAuthUrl');
    expect(subscriptionSource).toContain("source: 'subscription'");
    expect(subscriptionSource).toContain("returnTo: '/dashboard/inicio?from=subscription'");
    expect(subscriptionSource).not.toMatch(/materialized[\s\S]{0,1200}\/dashboard\/inicio/);
  });
});
