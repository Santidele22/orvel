import { describe, expect, expectTypeOf, it } from 'vitest';
import { createDashboardSupabaseClient } from './supabase-client.factory';
import type { DashboardRuntimeEnv } from './dashboard-env';
import { ORVEL_SUPABASE_AUTH_STORAGE_KEY } from '../auth/supabase-config';

type RpcResult = {
  data: unknown;
  error: { code?: string; message: string; details?: unknown } | null;
};

type RpcOnlyClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<RpcResult>;
};

describe('createDashboardSupabaseClient contract', () => {
  it('accepts a lightweight rpc-only client factory for booking runtime bootstrap', () => {
    const env: DashboardRuntimeEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
    };

    const createRpcOnlyClient = (_url: string, _anonKey: string): RpcOnlyClient => ({
      rpc: async () => ({
        data: null,
        error: null
      })
    });

    type DashboardFactoryInput = Parameters<typeof createDashboardSupabaseClient>[0];

    const dashboardFactoryInput: DashboardFactoryInput = {
      env,
      createClient: createRpcOnlyClient
    };

    const client = createDashboardSupabaseClient<RpcOnlyClient>(dashboardFactoryInput);

    expectTypeOf(client.rpc).toBeFunction();
  });

  it('uses the same auth storage key as AuthService-created Supabase clients', () => {
    const env: DashboardRuntimeEnv = {
      NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
    };

    let observedOptions: unknown;

    createDashboardSupabaseClient({
      env,
      createClient: (_url, _anonKey, options) => {
        observedOptions = options;
        return { rpc: async () => ({ data: null, error: null }) };
      }
    });

    expect(observedOptions).toMatchObject({
      auth: {
        storageKey: ORVEL_SUPABASE_AUTH_STORAGE_KEY,
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  });
});
