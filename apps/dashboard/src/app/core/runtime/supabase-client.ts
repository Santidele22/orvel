import type { SupabaseClient } from '@supabase/supabase-js';
import { createSupabaseClient as createClientFromEnv } from '@orvel/booking/infrastructure';
import { loadDashboardRuntimeEnv } from './dashboard-env';

// Dashboard-side client factory: feeds the @orvel/booking infrastructure
// factory with the dashboard build-time env (process.env or the Angular
// environments/environment.ts fallback). Non-DI consumers (notifications,
// entitlements, reference catalog) create a client per call through this
// helper; DI consumers receive the single shared client via SUPABASE_CLIENT.
export function createSupabaseClient(): SupabaseClient {
  const env = loadDashboardRuntimeEnv();
  return createClientFromEnv({ url: env.PUBLIC_SUPABASE_URL, anonKey: env.PUBLIC_SUPABASE_ANON_KEY });
}
