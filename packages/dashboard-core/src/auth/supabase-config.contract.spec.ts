import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Fase 3 of #1098 — the runtime env is resolved on first use, never at import time.
 *
 * This is a regression guard with a specific history: the core used to read the injected runtime
 * env at module scope, and in a development build (`ng serve`) the app's injection runs in the
 * entry module's body — after that entry's imports. So merely importing this module threw
 * "Missing required env vars" and the dev server served a dead app, while the production bundle
 * (topologically ordered) worked. The fix is lazy resolution; this spec keeps it lazy.
 */
const ENV_KEYS = [
  'PUBLIC_SUPABASE_URL',
  'PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY'
] as const;

describe('contract: supabase-config resolves the runtime env lazily', () => {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    vi.resetModules();
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = saved[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    vi.resetModules();
  });

  it('imports without throwing when no environment has been configured yet', async () => {
    const module = await import('./supabase-config');

    expect(module.SUPABASE_CONFIG).toBeDefined();
    expect(module.ORVEL_SUPABASE_AUTH_STORAGE_KEY).toBe('orvel.supabase.auth');
  });

  it('still fails, with the missing-var message, when a value is actually read', async () => {
    const { SUPABASE_CONFIG } = await import('./supabase-config');

    expect(() => SUPABASE_CONFIG.url).toThrow(/Missing required env vars|Missing PUBLIC_SUPABASE_URL/);
  });

  it('reads the configured fallback once it is available', async () => {
    const { configureDashboardEnvironmentFallback } = await import('../runtime/dashboard-env');
    configureDashboardEnvironmentFallback({
      PUBLIC_SUPABASE_URL: 'https://lazy-config.example',
      PUBLIC_SUPABASE_ANON_KEY: 'lazy-config-anon-key'
    });

    const { SUPABASE_CONFIG } = await import('./supabase-config');

    expect(SUPABASE_CONFIG.url).toBe('https://lazy-config.example');
    expect(SUPABASE_CONFIG.anonKey).toBe('lazy-config-anon-key');
  });
});
