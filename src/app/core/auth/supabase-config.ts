/**
 * Supabase Environment Configuration
 *
 * These values are read from environment variables.
 */

import { loadDashboardRuntimeEnv } from '../runtime/dashboard-env';

const runtimeEnv = loadDashboardRuntimeEnv();

export const SUPABASE_CONFIG = {
  /** Supabase project URL */
  url: runtimeEnv.NEXT_PUBLIC_SUPABASE_URL || '',
  /** Supabase anonymous key (publishable key) */
  anonKey: runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
} as const;


if (!SUPABASE_CONFIG.url || !SUPABASE_CONFIG.anonKey) {
  throw new Error('[supabase-config] Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY in environment');
}

export type SupabaseConfig = typeof SUPABASE_CONFIG;
