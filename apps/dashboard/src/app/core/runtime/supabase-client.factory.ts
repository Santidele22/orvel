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

const dashboardSupabaseClientCache = new Map<string, unknown>();

function dashboardSupabaseClientCacheKey(url: string, anonKey: string): string {
  return `${url}\0${anonKey}\0${ORVEL_SUPABASE_AUTH_STORAGE_KEY}`;
}

export function resetDashboardSupabaseClientCacheForTests(): void {
  dashboardSupabaseClientCache.clear();
}

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

  if (createClientFn) {
    return createClientFn(supabaseUrl, supabaseAnonKey, DASHBOARD_SUPABASE_AUTH_OPTIONS);
  }

  const cacheKey = dashboardSupabaseClientCacheKey(supabaseUrl, supabaseAnonKey);
  const cached = dashboardSupabaseClientCache.get(cacheKey);
  if (cached) {
    return cached as TClient;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, DASHBOARD_SUPABASE_AUTH_OPTIONS) as unknown as TClient;
  dashboardSupabaseClientCache.set(cacheKey, client);
  return client;
}
