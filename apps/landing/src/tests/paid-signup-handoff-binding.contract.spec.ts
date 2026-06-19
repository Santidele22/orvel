import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientMock = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const { POST } = await import('../pages/api/subscriptions/start');

const VALID_REFERENCE = `psh_${'a'.repeat(43)}`;

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function validPendingSignupRow(bindingHash: string) {
  return {
    email_encrypted: 'encrypted-email',
    email_hmac: 'email-hmac',
    pii_crypto_version: 'pending_signup_pii_v1',
    plan_code: 'STARTER',
    billing_period: 'monthly',
    business_type: 'peluqueria',
    selected_business_types: ['peluqueria'],
    handoff_binding_hash: bindingHash,
  };
}

function createPendingSignupLookupMock(data: unknown) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  const gt = vi.fn(() => ({ maybeSingle }));
  const inFilter = vi.fn(() => ({ gt }));
  const eq = vi.fn(() => ({ in: inFilter }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn((table: string) => {
    expect(table).toBe('pending_signup_intents');
    return { select };
  });
  return { client: { from }, from, maybeSingle };
}

function subscriptionStartRequest(cookie?: string): Request {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (cookie) headers.cookie = cookie;
  return new Request('https://orvel.test/api/subscriptions/start', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      plan: 'STARTER',
      billing: 'monthly',
      businessType: 'peluqueria',
      pending_signup_reference: VALID_REFERENCE,
    }),
  });
}

async function postSubscriptionStart(request: Request): Promise<Response> {
  return POST({ request } as Parameters<typeof POST>[0]);
}

describe('paid signup handoff browser binding contract', () => {
  beforeEach(() => {
    createClientMock.mockReset();
    vi.restoreAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
  });

  it('rejects a valid pending signup reference when the browser binding cookie is missing before calling the Edge function', async () => {
    const handoffLookup = createPendingSignupLookupMock(validPendingSignupRow(await sha256Text('expected-binding')));
    createClientMock.mockReturnValue(handoffLookup.client);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ init_point: 'https://mp.example.test/pay' }), { status: 200 }));

    const response = await postSubscriptionStart(subscriptionStartRequest());
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'pending_signup_missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a valid pending signup reference when the browser binding cookie does not match', async () => {
    const handoffLookup = createPendingSignupLookupMock(validPendingSignupRow(await sha256Text('expected-binding')));
    createClientMock.mockReturnValue(handoffLookup.client);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ init_point: 'https://mp.example.test/pay' }), { status: 200 }));

    const response = await postSubscriptionStart(subscriptionStartRequest('orvel_paid_signup_handoff=wrong-binding'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'pending_signup_missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects a referenced pending signup row that has no browser binding hash before calling the Edge function', async () => {
    const handoffLookup = createPendingSignupLookupMock(validPendingSignupRow(''));
    createClientMock.mockReturnValue(handoffLookup.client);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ init_point: 'https://mp.example.test/pay' }), { status: 200 }));

    const response = await postSubscriptionStart(subscriptionStartRequest('orvel_paid_signup_handoff=expected-binding'));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: 'pending_signup_missing' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts a valid pending signup reference when the browser binding cookie matches', async () => {
    const handoffLookup = createPendingSignupLookupMock(validPendingSignupRow(await sha256Text('expected-binding')));
    createClientMock.mockReturnValue(handoffLookup.client);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ init_point: 'https://mp.example.test/pay' }), { status: 200 }));

    const response = await postSubscriptionStart(subscriptionStartRequest('orvel_paid_signup_handoff=expected-binding'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ init_point: 'https://mp.example.test/pay' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
