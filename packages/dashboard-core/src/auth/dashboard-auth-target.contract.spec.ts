import { beforeEach, describe, expect, it } from 'vitest';
import { ORVEL_SUPABASE_AUTH_STORAGE_KEY, resolveAuthStorageKey } from '@orvel/config';
import {
  configureDashboardAuthTarget,
  dashboardAuthStorageKey,
  resetDashboardAuthTargetForTests
} from './dashboard-auth-target';
import {
  createDashboardSupabaseClient,
  resetDashboardSupabaseClientCacheForTests
} from '../adapters/supabase/supabase-client.factory';
import type { DashboardRuntimeEnv } from '../runtime/dashboard-env';

/**
 * Fase 4 of #1098 / ADR 0012.
 *
 * Landing, pwa and web will be served from different origins, and each target owns the
 * session it keeps. Today both apps run on the landing's origin and share one key, which is
 * audit finding S2: an XSS on the landing origin reads the app's refresh token. The console
 * is not deployed yet, so it can take a distinct key now at zero cost, while the pwa must
 * keep its historical literal or every installed session is logged out for nothing.
 */

const ENV: DashboardRuntimeEnv = {
  PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  PUBLIC_SUPABASE_ANON_KEY: 'anon-key',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key'
};

const rpcOnlyClient = () => ({ rpc: async () => ({ data: null, error: null }) });

describe('per-target auth storage key', () => {
  beforeEach(() => {
    resetDashboardAuthTargetForTests();
    resetDashboardSupabaseClientCacheForTests();
  });

  it('keeps the historical literal for the pwa target so installed sessions survive the split', () => {
    expect(resolveAuthStorageKey('pwa')).toBe('orvel.supabase.auth');
    expect(resolveAuthStorageKey('pwa')).toBe(ORVEL_SUPABASE_AUTH_STORAGE_KEY);
  });

  it('never hands the same key to two targets', () => {
    const keys = [resolveAuthStorageKey('pwa'), resolveAuthStorageKey('web')];

    expect(new Set(keys).size).toBe(2);
    for (const key of keys) {
      expect(key.length).toBeGreaterThan(0);
    }
  });

  it('defaults to the pwa target and follows the target the app declares', () => {
    expect(dashboardAuthStorageKey()).toBe(resolveAuthStorageKey('pwa'));

    configureDashboardAuthTarget('web');

    expect(dashboardAuthStorageKey()).toBe(resolveAuthStorageKey('web'));
  });

  it('builds the browser client with the key of the declared target', () => {
    configureDashboardAuthTarget('web');

    let observedOptions: unknown;
    createDashboardSupabaseClient({
      env: ENV,
      createClient: (_url, _anonKey, options) => {
        observedOptions = options;
        return rpcOnlyClient();
      }
    });

    expect(observedOptions).toMatchObject({
      auth: {
        storageKey: resolveAuthStorageKey('web'),
        persistSession: true,
        detectSessionInUrl: false
      }
    });
  });

  it('does not serve a cached client that was built for another target', () => {
    const pwaClient = createDashboardSupabaseClient({ env: ENV });

    configureDashboardAuthTarget('web');
    const webClient = createDashboardSupabaseClient({ env: ENV });

    expect(webClient).not.toBe(pwaClient);
    expect(typeof webClient.rpc).toBe('function');
  });
});
