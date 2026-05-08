import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';

const PLAN_PAGE_PATH = new URL('../pages/auth/signup/plan.astro', import.meta.url);
const COMPLETE_PAGE_PATH = new URL('../pages/auth/signup/complete.astro', import.meta.url);
const TEST_CHECKOUT_PAGE_PATH = new URL('../pages/billing/test-checkout.astro', import.meta.url);
const CHECKOUT_START_API_PATH = new URL('../pages/api/checkout/start.ts', import.meta.url);
const CHECKOUT_STATUS_API_PATH = new URL('../pages/api/checkout/status.ts', import.meta.url);
const WEBHOOK_FN_PATH = new URL('../../../supabase/functions/mercadopago-webhook/index.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path, 'utf8');
}

describe('Contract: signup paid plan deferred checkout flow', () => {
  it('paid plan CTAs continue to signup credentials with the selected plan', async () => {
    const source = await loadSource(PLAN_PAGE_PATH);

    for (const plan of ['STARTER', 'GROWTH', 'PRO']) {
      expect(source).toContain(`href="/auth/signup/credentials?plan=${plan}"`);
      expect(source).not.toContain(`href="/api/checkout/start?plan=${plan}"`);
    }
  });

  it('preserves free plan signup credentials routing', async () => {
    const source = await loadSource(PLAN_PAGE_PATH);

    expect(source).toContain('href="/auth/signup/credentials?plan=FREE"');
  });

  it('does not render email modal fields for paid checkout', async () => {
    const source = await loadSource(PLAN_PAGE_PATH);

    expect(source).not.toContain('id="checkoutModal"');
    expect(source).not.toContain('id="modalCheckoutForm"');
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

  it('sends paid plan completions to deferred checkout after onboarding data is available', async () => {
    const source = await loadSource(COMPLETE_PAGE_PATH);

    expect(source).toContain("const isPaidPlan = plan !== 'FREE'");
    expect(source).toContain('/billing/test-checkout?plan=');
    expect(source.indexOf('completeOAuthBusinessTypeOnboarding')).toBeLessThan(source.indexOf('window.location.href = returnTo'));
    expect(source).toContain("const returnTo = isPaidPlan");
    expect(source).toMatch(/dashboard\/inicio/);
  });

  it('renders billing test checkout route with plan query fallback and safe placeholder note', async () => {
    const source = await loadSource(TEST_CHECKOUT_PAGE_PATH);

    expect(source).toContain('URLSearchParams(window.location.search)');
    expect(source).toMatch(/FREE|STARTER|GROWTH|PRO/);
    expect(source).toContain('redirigir a Mercado Pago');
    expect(source).toContain("fetch('/api/checkout/start'");
    expect(source).toContain("method: 'POST'");
    expect(source).toContain('headers.Authorization');
    expect(source).toContain('idempotencyKey');
    expect(source).toContain('/api/checkout/status?checkout_session_id=');
    expect(source).toContain('getSession()');
    expect(source).not.toContain('Pago exitoso');
    expect(source).not.toContain('window.location.href = `/api/checkout/start?plan=');
  });
});

describe('Contract: same-origin checkout start endpoint', () => {
  it('defines a server-side GET handler that redirects to provider init_point on success', async () => {
    const source = await loadSource(CHECKOUT_START_API_PATH);

    expect(source).toMatch(/export\s+const\s+GET\s*:\s*APIRoute/);
    expect(source).toMatch(/create-subscription/);
    expect(source).toMatch(/init_point/);
    expect(source).toMatch(/return\s+redirect\(/);
  });

  it('defines a POST handler that forwards auth and returns init_point JSON', async () => {
    const source = await loadSource(CHECKOUT_START_API_PATH);

    expect(source).toMatch(/export\s+const\s+POST\s*:\s*APIRoute/);
    expect(source).toContain('request.headers.get("Authorization")');
    expect(source).toContain('headers.Authorization = authorization');
    expect(source).toContain('jsonResponse({ init_point: result.initPoint })');
    expect(source).toContain('body: JSON.stringify({ plan_code: plan, plan_identifier: plan })');
    expect(source).toContain('Idempotency-Key');
  });

  it('includes explicit mapping validation errors from backend contract', async () => {
    const source = await loadSource(CHECKOUT_START_API_PATH);

    expect(source).toContain('PLAN_MAPPING_REQUIRED');
    expect(source).toContain('PLAN_MAPPING_INVALID');
    expect(source).toContain('PLAN_IDENTIFIER_INVALID');
  });

  it('returns controlled fallback state on provider/start failure', async () => {
    const source = await loadSource(CHECKOUT_START_API_PATH);

    expect(source).toMatch(/checkout_failed|checkout_error|retry/i);
    expect(source).toMatch(/\/billing\/test-checkout/);
  });
});

describe('Contract: checkout status polling endpoint', () => {
  it('provides a GET proxy for backend subscription status checks', async () => {
    const source = await loadSource(CHECKOUT_STATUS_API_PATH);

    expect(source).toMatch(/export\s+const\s+GET\s*:\s*APIRoute/);
    expect(source).toContain('subscription-status');
    expect(source).toContain('checkout_session_id');
  });
});

describe('Contract: webhook reconciliation safeguards remain present', () => {
  it('keeps consistency checks around external_reference and checkout session', async () => {
    const source = await loadSource(WEBHOOK_FN_PATH);

    expect(source).toMatch(/external_reference/);
    expect(source).toMatch(/checkout[_-]?session/i);
  });
});
