import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { dashboardAuthStorageKey } from '../../auth/dashboard-auth-target';
import { browserStorage } from '../../storage/browser-storage.adapter';
import { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv } from '../../runtime/dashboard-env';

export type DashboardSupabaseAuthOptions = ReturnType<typeof dashboardSupabaseAuthOptions>;

/**
 * Resolved per call, not at module load: the app declares its execution target from its bootstrap
 * (`src/app/runtime/configure-dashboard-environment.ts`), which in a development build is evaluated
 * after this module's imports. See ADR 0012 and the Fase 3 regression in #1116.
 */
function dashboardSupabaseAuthOptions() {
  return {
    auth: {
      flowType: 'pkce' as const,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: dashboardAuthStorageKey(),
      storage: browserStorage() ?? undefined
    }
  };
}

const dashboardSupabaseClientCache = new Map<string, unknown>();

function dashboardSupabaseClientCacheKey(url: string, anonKey: string): string {
  return `${url}\0${anonKey}\0${dashboardAuthStorageKey()}`;
}

export function resetDashboardSupabaseClientCacheForTests(): void {
  dashboardSupabaseClientCache.clear();
}

export function createDashboardSupabaseClient<TClient = SupabaseClient>({
  env,
  createClient: createClientFn
}: {
  env: DashboardRuntimeEnv;
  createClient?: (url: string, anonKey: string, options?: DashboardSupabaseAuthOptions) => TClient;
}): TClient {
  const [urlEnvKey, anonKeyEnvKey] = REQUIRED_DASHBOARD_ENV_KEYS;
  const supabaseUrl = env[urlEnvKey];
  const supabaseAnonKey = env[anonKeyEnvKey];
  const authOptions = dashboardSupabaseAuthOptions();

  if (createClientFn) {
    return createClientFn(supabaseUrl, supabaseAnonKey, authOptions);
  }

  const cacheKey = dashboardSupabaseClientCacheKey(supabaseUrl, supabaseAnonKey);
  const cached = dashboardSupabaseClientCache.get(cacheKey);
  if (cached) {
    return cached as TClient;
  }

  const client = createClient(supabaseUrl, supabaseAnonKey, authOptions) as unknown as TClient;
  dashboardSupabaseClientCache.set(cacheKey, client);
  return client;
}
