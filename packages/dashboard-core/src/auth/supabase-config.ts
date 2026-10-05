/**
 * Supabase Environment Configuration
 *
 * These values are read from environment variables.
 */

import { ORVEL_SUPABASE_AUTH_STORAGE_KEY } from '@orvel/config';
import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';

export { ORVEL_SUPABASE_AUTH_STORAGE_KEY };

const runtimeEnv = loadDashboardRuntimeEnv();

export const SUPABASE_CONFIG = {
  /** Supabase project URL */
  url: runtimeEnv.PUBLIC_SUPABASE_URL || '',
  /** Supabase anonymous key (publishable key) */
  anonKey: runtimeEnv.PUBLIC_SUPABASE_ANON_KEY || '',
  /** Shared browser storage key used by landing and dashboard for same-origin local auth */
  storageKey: ORVEL_SUPABASE_AUTH_STORAGE_KEY
} as const;


if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
  throw new Error('[supabase-config] Missing PUBLIC_SUPABASE_URL or PUBLIC_SUPABASE_ANON_KEY in environment');
}

export type SupabaseConfig = typeof SUPABASE_CONFIG;
