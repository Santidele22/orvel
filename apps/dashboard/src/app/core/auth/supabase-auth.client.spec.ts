import { describe, expect, expectTypeOf, it, vi, beforeEach } from 'vitest';

const { createClientMock } = vi.hoisted(() => ({
  createClientMock: vi.fn()
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: createClientMock
}));

import {
  ORVEL_SUPABASE_AUTH_STORAGE_KEY,
  createSupabaseAuthClient,
  type SupabaseSession
} from './supabase-auth.client';

describe('SupabaseAuthClientAdapter.onAuthStateChange contract', () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it('returns a subscription wrapper with unsubscribe', () => {
    const unsubscribeSpy = vi.fn();

    createClientMock.mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn(() => ({
          data: {
            subscription: {
              unsubscribe: unsubscribeSpy
            }
          }
        }))
      }
    });

    const client = createSupabaseAuthClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });

    const result = client.onAuthStateChange(() => {});
    result.data.subscription.unsubscribe();

    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  it('uses the shared landing/dashboard Supabase auth storage key without trusting storage as auth', () => {
    createClientMock.mockReturnValue({ auth: { onAuthStateChange: vi.fn() } });

    createSupabaseAuthClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });

    expect(ORVEL_SUPABASE_AUTH_STORAGE_KEY).toBe('orvel.supabase.auth');
    expect(createClientMock).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        auth: expect.objectContaining({
          storageKey: 'orvel.supabase.auth',
          persistSession: true,
          flowType: 'pkce'
        })
      })
    );
  });

  it('maps callback session to local SupabaseSession contract', () => {
    const rawSupabaseSession = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: {
        id: 'user-1',
        email: undefined,
        email_confirmed_at: undefined,
        created_at: '2026-01-01T00:00:00.000Z'
      }
    };

    createClientMock.mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          callback('SIGNED_IN', rawSupabaseSession);
          return {
            data: {
              subscription: {
                unsubscribe: vi.fn()
              }
            }
          };
        })
      }
    });

    const client = createSupabaseAuthClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });

    let receivedSession: SupabaseSession | null = null;

    client.onAuthStateChange((_event, session) => {
      expectTypeOf(session).toEqualTypeOf<SupabaseSession | null>();
      receivedSession = session;
    });

    expect(receivedSession).not.toBeNull();
    expect(receivedSession?.user.email).toBe('');
    expect(receivedSession?.user.email_confirmed_at).toBeNull();
  });

  it('maps null SDK session to null callback session', () => {
    createClientMock.mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          callback('SIGNED_OUT', null);
          return {
            data: {
              subscription: {
                unsubscribe: vi.fn()
              }
            }
          };
        })
      }
    });

    const client = createSupabaseAuthClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });

    let receivedSession: SupabaseSession | null = { } as SupabaseSession;

    client.onAuthStateChange((_event, session) => {
      receivedSession = session;
    });

    expect(receivedSession).toBeNull();
  });

  it('maps SDK session with null user to null callback session', () => {
    const rawSupabaseSessionWithNullUser = {
      access_token: 'access',
      refresh_token: 'refresh',
      expires_in: 3600,
      token_type: 'bearer',
      user: null
    };

    createClientMock.mockReturnValue({
      auth: {
        onAuthStateChange: vi.fn((callback: (event: string, session: unknown) => void) => {
          callback('SIGNED_IN', rawSupabaseSessionWithNullUser);
          return {
            data: {
              subscription: {
                unsubscribe: vi.fn()
              }
            }
          };
        })
      }
    });

    const client = createSupabaseAuthClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });

    let receivedSession: SupabaseSession | null = { } as SupabaseSession;

    client.onAuthStateChange((_event, session) => {
      receivedSession = session;
    });

    expect(receivedSession).toBeNull();
  });
});

describe('SupabaseAuthClientAdapter.signOut contract', () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it('passes optional scope through to supabase-js auth.signOut', async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    createClientMock.mockReturnValue({ auth: { signOut } });

    const client = createSupabaseAuthClient({
      supabaseUrl: 'https://example.supabase.co',
      supabaseAnonKey: 'anon-key'
    });

    await expect(client.signOut({ scope: 'local' })).resolves.toEqual({ error: null });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });
});

