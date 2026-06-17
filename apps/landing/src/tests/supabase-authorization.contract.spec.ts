import { afterEach, describe, expect, it, vi } from 'vitest';

import { appendSupabaseAuthorizationHeader, isJwtShapedSupabaseKey } from '../lib/supabaseAuthorization';
import { POST } from '../pages/api/subscriptions/start';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Contract: Supabase Edge Function authorization forwarding', () => {
  const jwtShapedBearer = 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYXV0aGVudGljYXRlZCJ9.signature';

  it('does not send publishable/non-JWT keys as Bearer fallback', () => {
    const headers: Record<string, string> = { apikey: 'sb_publishable_public-key' };

    appendSupabaseAuthorizationHeader(headers, null, 'sb_publishable_public-key');

    expect(headers).not.toHaveProperty('Authorization');
  });

  it.each([
    ['random bearer token', 'Bearer random'],
    ['APP_USR MercadoPago token', 'Bearer APP_USR-1234567890'],
    ['Supabase publishable key', 'Bearer sb_publishable_public-key'],
    ['HMAC-like non-JWT token', 'Bearer hmac_sha256:abcdef1234567890'],
  ])('drops malformed inbound Authorization: %s', (_caseName, inboundAuthorization) => {
    const headers: Record<string, string> = { apikey: 'sb_publishable_public-key' };

    appendSupabaseAuthorizationHeader(headers, inboundAuthorization, 'sb_publishable_public-key');

    expect(headers).not.toHaveProperty('Authorization');
  });

  it('preserves JWT-shaped inbound Bearer Authorization over any fallback', () => {
    const headers: Record<string, string> = { apikey: 'sb_publishable_public-key' };

    appendSupabaseAuthorizationHeader(headers, jwtShapedBearer, 'sb_publishable_public-key');

    expect(headers.Authorization).toBe(jwtShapedBearer);
  });

  it('only allows JWT-shaped Supabase public keys as anonymous Bearer fallback', () => {
    expect(isJwtShapedSupabaseKey('sb_publishable_public-key')).toBe(false);
    expect(isJwtShapedSupabaseKey('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature')).toBe(true);
  });
});

describe('Contract: /api/subscriptions/start Supabase headers', () => {
  it('does not forward malformed inbound Authorization and still uses apikey', async () => {
    vi.stubEnv('SUPABASE_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'sb_publishable_public-key');

    const fetchSpy = vi.fn(async () => new Response(
      JSON.stringify({ init_point: 'https://mercadopago.example.test/preapproval' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchSpy);

    const request = new Request('https://orvel.example.test/api/subscriptions/start', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer APP_USR-1234567890',
      },
      body: JSON.stringify({ plan: 'STARTER', businessType: 'peluqueria' }),
    });

    const response = await POST({ request } as Parameters<typeof POST>[0]);

    expect(response.status).toBe(200);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [, init] = fetchSpy.mock.calls[0]!;
    expect(init?.headers).toMatchObject({ apikey: 'sb_publishable_public-key' });
    expect(init?.headers).not.toHaveProperty('Authorization');
  });
});
