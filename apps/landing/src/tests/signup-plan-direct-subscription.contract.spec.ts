import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const PLAN_CARD_PATH = new URL('../components/molecules/SignupPlanCard.astro', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const SUBSCRIPTION_PAGE_PATH = new URL('../pages/billing/subscription.astro', import.meta.url);
const SUBSCRIPTION_START_API_PATH = new URL('../pages/api/subscriptions/start.ts', import.meta.url);
const SUBSCRIPTION_STATUS_API_PATH = new URL('../pages/api/subscriptions/status.ts', import.meta.url);
const WEBHOOK_FN_PATH = new URL('../../../supabase/functions/mercadopago-webhook/index.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: signup paid plan deferred subscription flow', () => {
  it('paid plan CTAs continue to signup credentials with the selected plan', async () => {
    const source = await loadSource(PLAN_PAGE_PATH);
    const cardSource = await loadSource(PLAN_CARD_PATH);

    for (const plan of ['STARTER', 'GROWTH', 'PRO']) {
      expect(`${source}\n${cardSource}`).toContain('/auth/signup/credentials?plan=');
      expect(source).not.toContain(`href="/api/subscriptions/start?plan=${plan}"`);
    }
  });

  it('preserves free plan signup credentials routing', async () => {
    const source = `${await loadSource(PLAN_PAGE_PATH)}\n${await loadSource(PLAN_CARD_PATH)}`;

    expect(source).toContain('/auth/signup/credentials?plan=');
  });

  it('does not render email modal fields for paid subscription', async () => {
    const source = await loadSource(PLAN_PAGE_PATH);

    expect(source).not.toContain('id="subscriptionModal"');
    expect(source).not.toContain('id="modalSubscriptionForm"');
    expect(source).not.toContain('name="email"');
    expect(source).not.toContain('Ingresá tu email para continuar al pago seguro con Mercado Pago.');
  });

  it('does not hardcode Supabase project URL or anon key in landing plan page', async () => {
    const source = await loadSource(PLAN_PAGE_PATH);

    expect(source).not.toContain('supabase.co');
    expect(source).not.toContain('sb_publishable_');
  });

  it('defines selected plan before wiring completion step links', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);

    expect(source.indexOf("const plan = normalizeSelectedPlan")).toBeGreaterThan(-1);
    expect(source.indexOf("const plan = normalizeSelectedPlan")).toBeLessThan(source.indexOf("step2Link.href"));
    expect(source.indexOf("const plan = normalizeSelectedPlan")).toBeLessThan(source.indexOf("backBtn.href"));
  });

  it('sends paid plan completions to deferred subscription after onboarding data is available', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);

    expect(source).toContain("const isPaidPlan = plan !== 'FREE'");
    expect(source).toContain('/billing/subscription?plan=');
    expect(source.indexOf('completeOAuthBusinessTypeOnboarding')).toBeLessThan(source.indexOf('window.location.href = returnTo'));
    expect(source).toContain("const returnTo = isPaidPlan");
    expect(source).toMatch(/dashboard\/inicio/);
  });

  it('renders billing subscription route with plan query fallback and safe placeholder note', async () => {
    const source = await loadSource(SUBSCRIPTION_PAGE_PATH);

    expect(source).toContain('URLSearchParams(window.location.search)');
    expect(source).toMatch(/FREE|STARTER|GROWTH|PRO/);
    expect(source).toContain('redirigir a Mercado Pago');
    expect(source).toContain("fetch('/api/subscriptions/start'");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('headers.Authorization');
    expect(source).toContain('idempotencyKey');
    expect(source).toContain('/api/subscriptions/status?subscription_session_id=');
    expect(source).toContain('getSession()');
    expect(source).not.toContain('Pago exitoso');
    expect(source).not.toContain('window.location.href = `/api/subscriptions/start?plan=');
  });
});

describe('Contract: same-origin subscription start endpoint', () => {
  it('defines a server-side GET handler that redirects to provider init_point on success', async () => {
    const source = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(source).toMatch(/export\s+const\s+GET\s*:\s*APIRoute/);
    expect(source).toMatch(/create-subscription/);
    expect(source).toMatch(/init_point/);
    expect(source).toMatch(/return\s+redirect\(/);
  });

  it('defines a POST handler that forwards auth and returns init_point JSON', async () => {
    const source = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(source).toMatch(/export\s+const\s+POST\s*:\s*APIRoute/);
    expect(source).toContain('request.headers.get("Authorization")');
    expect(source).toContain('headers.Authorization = authorization');
    expect(source).toContain('jsonResponse({ init_point: result.initPoint })');
    expect(source).toContain('body: JSON.stringify({');
    expect(source).toContain('plan_code: plan,');
    expect(source).toContain('email,');
    expect(source).toContain('Idempotency-Key');
  });

  it('includes explicit mapping validation errors from backend contract', async () => {
    const source = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
  });

  it('returns controlled fallback state on provider/start failure', async () => {
    const source = await loadSource(SUBSCRIPTION_START_API_PATH);

    expect(source).toMatch(/subscription_failed|subscription_error|retry/i);
    expect(source).toMatch(/\/billing\/subscription/);
  });
});

describe('Contract: subscription status polling endpoint', () => {
  it('provides a GET proxy for backend subscription status checks', async () => {
    const source = await loadSource(SUBSCRIPTION_STATUS_API_PATH);

    expect(source).toMatch(/export\s+const\s+GET\s*:\s*APIRoute/);
    expect(source).toContain('subscription-status');
    expect(source).toContain('subscription_session_id');
  });
});

describe.skip('Contract: webhook reconciliation safeguards remain present', () => {
  it('keeps consistency checks around external_reference and legacy session references', async () => {
    const source = await loadSource(WEBHOOK_FN_PATH);

    expect(source).toMatch(/external_reference/);
    expect(source).toMatch(/legacy|subscription[_-]?session|preapproval[_-]?session/i);
  });
});
