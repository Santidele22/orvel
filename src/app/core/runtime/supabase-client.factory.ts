import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv } from './dashboard-env';

export function createDashboardSupabaseClient<TClient = SupabaseClient>({
  env,
  createClient: createClientFn
}: {
  env: DashboardRuntimeEnv;
  createClient?: (url: string, anonKey: string) => TClient;
}): TClient {
  const [urlEnvKey, anonKeyEnvKey] = REQUIRED_DASHBOARD_ENV_KEYS;
  const supabaseUrl = env[urlEnvKey];
  const supabaseAnonKey = env[anonKeyEnvKey];

  // Use provided createClient function or default to @supabase/supabase-js
  const client = createClientFn
    ? createClientFn(supabaseUrl, supabaseAnonKey)
    : (createClient(supabaseUrl, supabaseAnonKey) as unknown as TClient);

  return client as TClient;
}
