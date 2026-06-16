import { describe, expect, it } from 'vitest';

import { appendSupabaseAuthorizationHeader, isJwtShapedSupabaseKey } from '../lib/supabaseAuthorization';

describe('Contract: Supabase Edge Function authorization forwarding', () => {
  it('does not send publishable/non-JWT keys as Bearer fallback', () => {
    const headers: Record<string, string> = { apikey: 'sb_publishable_public-key' };

    appendSupabaseAuthorizationHeader(headers, null, 'sb_publishable_public-key');

    expect(headers).not.toHaveProperty('Authorization');
  });

  it('preserves real inbound Authorization over any fallback', () => {
    const headers: Record<string, string> = { apikey: 'sb_publishable_public-key' };

    appendSupabaseAuthorizationHeader(headers, 'Bearer real.user.jwt', 'sb_publishable_public-key');

    expect(headers.Authorization).toBe('Bearer real.user.jwt');
  });

  it('only allows JWT-shaped Supabase public keys as anonymous Bearer fallback', () => {
    expect(isJwtShapedSupabaseKey('sb_publishable_public-key')).toBe(false);
    expect(isJwtShapedSupabaseKey('eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature')).toBe(true);
  });
});
