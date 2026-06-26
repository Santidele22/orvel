import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ORVEL_SUPABASE_AUTH_STORAGE_KEY } from '../auth/supabase-config';
import { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv } from './dashboard-env';

const DASHBOARD_SUPABASE_AUTH_OPTIONS = {
  auth: {
    flowType: 'pkce' as const,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
    storageKey: ORVEL_SUPABASE_AUTH_STORAGE_KEY,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined
  }
};

export function createDashboardSupabaseClient<TClient = SupabaseClient>({
  env,
  createClient: createClientFn
}: {
  env: DashboardRuntimeEnv;
  createClient?: (url: string, anonKey: string, options?: typeof DASHBOARD_SUPABASE_AUTH_OPTIONS) => TClient;
}): TClient {
  const [urlEnvKey, anonKeyEnvKey] = REQUIRED_DASHBOARD_ENV_KEYS;
  const supabaseUrl = env[urlEnvKey];
  const supabaseAnonKey = env[anonKeyEnvKey];

  // Use provided createClient function or default to @supabase/supabase-js
  const client = createClientFn
    ? createClientFn(supabaseUrl, supabaseAnonKey, DASHBOARD_SUPABASE_AUTH_OPTIONS)
    : (createClient(supabaseUrl, supabaseAnonKey, DASHBOARD_SUPABASE_AUTH_OPTIONS) as unknown as TClient);

  return client as TClient;
}
