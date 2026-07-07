import { afterEach, describe, expect, it, vi } from 'vitest';

import { POST } from '../pages/api/subscriptions/start';

const SUPABASE_FUNCTION_URL = 'https://supabase.example.test/functions/v1/create-subscription';

const completeProtectedPendingSignupIntent = {
  email_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"email-iv","ct":"email-ct"}',
  email_hmac: 'email-hmac',
  first_name_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"first-iv","ct":"first-ct"}',
  first_name_hmac: 'first-hmac',
  last_name_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"last-iv","ct":"last-ct"}',
  last_name_hmac: 'last-hmac',
  phone_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"phone-iv","ct":"phone-ct"}',
  phone_hmac: 'phone-hmac',
  business_name_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"business-iv","ct":"business-ct"}',
  business_name_hmac: 'business-hmac',
  pii_crypto_version: 'pending_signup_pii_v1',
  business_type: 'peluqueria',
  selected_business_types: ['peluqueria'],
  billing_period: 'monthly',
};

function stubSubscriptionEnv(): void {
  vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
  vi.stubEnv('SUPABASE_ANON_KEY', 'sb_publishable_public-key');
}

function postSubscriptionStart(body: Record<string, unknown>): Promise<Response> {
  return POST({
    request: new Request('https://orvel.example.test/api/subscriptions/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }),
  } as Parameters<typeof POST>[0]);
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('RED contract: /api/subscriptions/start pending signup payload validation', () => {
  it('rejects intent_id-only pending_signup_intent locally before calling Edge with a friendly code', async () => {
    stubSubscriptionEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await postSubscriptionStart({
      plan: 'PREMIUM',
      pending_signup_intent: { intent_id: 'psi_123' },
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'pending_signup_email_required',
      message: 'Necesitamos proteger tu email antes de iniciar el pago. Volvé al formulario y reintentá.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('forwards complete protected pending_signup_intent mode with encrypted email fields and without plaintext PII or password', async () => {
    stubSubscriptionEnv();
    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ init_point: 'https://mercadopago.example.test/preapproval' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await postSubscriptionStart({
      plan: 'PREMIUM',
      email: 'plain@example.test',
      password: 'plain-password',
      firstName: 'Plain',
      lastName: 'Person',
      phone: '+5491111111111',
      pending_signup_intent: completeProtectedPendingSignupIntent,
    });

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(SUPABASE_FUNCTION_URL);
    const payload = JSON.parse(String(init?.body));
    expect(payload).toMatchObject({
      plan_code: 'PREMIUM',
      plan_identifier: 'PREMIUM',
      mode: 'pending_signup_intent',
      pending_signup_intent: expect.objectContaining({
        email_encrypted: completeProtectedPendingSignupIntent.email_encrypted,
        email_hmac: completeProtectedPendingSignupIntent.email_hmac,
        pii_crypto_version: 'pending_signup_pii_v1',
        business_type: 'peluqueria',
      }),
    });
    expect(JSON.stringify(payload)).not.toMatch(/plain@example\.test|plain-password|Plain|Person|\+5491111111111/);
    expect(payload.pending_signup_intent).not.toHaveProperty('email');
    expect(payload.pending_signup_intent).not.toHaveProperty('password');
    expect(payload.pending_signup_intent).not.toHaveProperty('firstName');
    expect(payload.pending_signup_intent).not.toHaveProperty('lastName');
    expect(payload.pending_signup_intent).not.toHaveProperty('phone');
  });

  it.each([
    ['email_encrypted without email_hmac', { email_encrypted: completeProtectedPendingSignupIntent.email_encrypted }],
    ['email_hmac without email_encrypted', { email_hmac: completeProtectedPendingSignupIntent.email_hmac }],
    ['business_name_encrypted without business_name_hmac', { ...completeProtectedPendingSignupIntent, business_name_hmac: undefined }],
    ['phone_hmac without phone_encrypted', { ...completeProtectedPendingSignupIntent, phone_encrypted: undefined }],
  ])('rejects protected PII half-pairs locally before Edge: %s', async (_caseName, pendingSignupIntent) => {
    stubSubscriptionEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await postSubscriptionStart({
      plan: 'PREMIUM',
      pending_signup_intent: pendingSignupIntent,
    });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'pending_signup_pii_invalid',
      message: 'No pudimos validar tus datos protegidos. Volvé al formulario y reintentá.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('RED contract: /api/subscriptions/start plan aliases use Edge-compatible plan codes', () => {
  it.each([
    ['BASIC', 'PREMIUM'],
    ['MEDIUM', 'PREMIUM'],
    ['STARTED', 'PREMIUM'],
    ['STARTER', 'PREMIUM'],
    ['GROWTH', 'PREMIUM'],
    ['PRO', 'PREMIUM'],
  ])('maps %s to %s before calling create-subscription', async (inputPlan, expectedEdgePlan) => {
    stubSubscriptionEnv();
    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ init_point: 'https://mercadopago.example.test/preapproval' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await postSubscriptionStart({ plan: inputPlan, businessType: 'peluqueria' });

    expect(response.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0]!;
    const payload = JSON.parse(String(init?.body));
    expect(payload.plan_code).toBe(expectedEdgePlan);
    expect(payload.plan_identifier).toBe(expectedEdgePlan);
  });

  it.each(['quarterly', 'annual'])('normalizes unsupported %s billing to monthly before Edge', async (billing) => {
    stubSubscriptionEnv();
    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ init_point: 'https://mercadopago.example.test/preapproval' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchSpy);

    const response = await postSubscriptionStart({ plan: 'PREMIUM', billing, businessType: 'peluqueria' });

    expect(response.status).toBe(200);
    const [, init] = fetchSpy.mock.calls[0]!;
    const payload = JSON.parse(String(init?.body));
    expect(payload.cadence).toBe('monthly');
    expect(payload.billing_period).toBe('monthly');
  });

  it('fails unsupported plan values locally before Edge', async () => {
    stubSubscriptionEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const response = await postSubscriptionStart({ plan: 'ENTERPRISE', businessType: 'peluqueria' });
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      error: 'invalid_plan',
      message: 'El plan seleccionado no está disponible.',
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
