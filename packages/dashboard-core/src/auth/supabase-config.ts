/**
 * Supabase Environment Configuration
 *
 * These values are read from environment variables.
 */

import { ORVEL_SUPABASE_AUTH_STORAGE_KEY } from '@orvel/config';
import { loadDashboardRuntimeEnv, type DashboardRuntimeEnv } from '../runtime/dashboard-env';
import { dashboardAuthStorageKey } from './dashboard-auth-target';

/**
 * @deprecated Kept as a re-export for the specs that pin the pwa literal. Consumers must resolve
 * their own target's key through `dashboardAuthStorageKey()` (ADR 0012).
 */
export { ORVEL_SUPABASE_AUTH_STORAGE_KEY };

/**
 * Fase 3 of #1098 — resolved on first use, not at import time.
 *
 * The runtime env is *injected* by the app (`configureDashboardEnvironmentFallback`). In a
 * development build that injection lands in the entry module's body, which the browser evaluates
 * **after** the same entry's imports — so reading it at module scope made this module throw the
 * moment anything imported it, before the app had configured anything, and `ng serve` died with
 * "Missing required env vars".
 *
 * Reading it lazily keeps the same failure and the same message for a genuinely misconfigured
 * deploy, but at the moment a value is actually needed (bootstrap), by which time the app has
 * configured the fallback.
 */
let resolvedRuntimeEnv: DashboardRuntimeEnv | null = null;

function runtimeEnv(): DashboardRuntimeEnv {
  if (resolvedRuntimeEnv) {
    return resolvedRuntimeEnv;
  }

  const env = loadDashboardRuntimeEnv();

  if (!env.PUBLIC_SUPABASE_URL || !env.PUBLIC_SUPABASE_ANON_KEY) {
    throw new Error('[supabase-config] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in environment');
  }

  resolvedRuntimeEnv = env;
  return env;
}

export const SUPABASE_CONFIG = {
  /** Supabase project URL */
  get url(): string {
    return runtimeEnv().PUBLIC_SUPABASE_URL || '';
  },
  /** Supabase anonymous key (publishable key) */
  get anonKey(): string {
    return runtimeEnv().PUBLIC_SUPABASE_ANON_KEY || '';
  },
  /**
   * Session key of the target this app declared (Fase 4 of #1098). Landing, pwa and web no longer
   * share one key: sharing it was the mechanical half of audit finding S2.
   */
  get storageKey(): string {
    return dashboardAuthStorageKey();
  }
} as const;

export type SupabaseConfig = typeof SUPABASE_CONFIG;
