export const REQUIRED_DASHBOARD_ENV_KEYS = ['PUBLIC_SUPABASE_URL', 'PUBLIC_SUPABASE_ANON_KEY'] as const;

type RequiredDashboardEnvKey = (typeof REQUIRED_DASHBOARD_ENV_KEYS)[number];
type LegacyPublicSupabaseEnvKey = 'NEXT_PUBLIC_SUPABASE_URL' | 'NEXT_PUBLIC_SUPABASE_ANON_KEY';

export type DashboardRuntimeEnv = Record<RequiredDashboardEnvKey, string> &
  Record<LegacyPublicSupabaseEnvKey, string>;

export type EnvSource = Record<string, string | undefined>;

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function withLegacyPublicSupabaseAliases(source: EnvSource): EnvSource {
  return {
    ...source,
    PUBLIC_SUPABASE_URL: source['PUBLIC_SUPABASE_URL'] ?? source['NEXT_PUBLIC_SUPABASE_URL'],
    PUBLIC_SUPABASE_ANON_KEY: source['PUBLIC_SUPABASE_ANON_KEY'] ?? source['NEXT_PUBLIC_SUPABASE_ANON_KEY'],
    NEXT_PUBLIC_SUPABASE_URL: source['NEXT_PUBLIC_SUPABASE_URL'] ?? source['PUBLIC_SUPABASE_URL'],
    NEXT_PUBLIC_SUPABASE_ANON_KEY: source['NEXT_PUBLIC_SUPABASE_ANON_KEY'] ?? source['PUBLIC_SUPABASE_ANON_KEY']
  };
}

export function hasRequiredDashboardEnv(source: EnvSource): boolean {
  const normalizedSource = withLegacyPublicSupabaseAliases(source);

  return REQUIRED_DASHBOARD_ENV_KEYS.every((key) => !isMissing(normalizedSource[key]));
}

export function loadDashboardRuntimeEnv(source: EnvSource): DashboardRuntimeEnv {
  const normalizedSource = withLegacyPublicSupabaseAliases(source);
  const missing = REQUIRED_DASHBOARD_ENV_KEYS.filter((key) => isMissing(normalizedSource[key]));

  if (missing.length > 0) {
    throw new Error(
      `[dashboard-env] Missing required env vars: ${missing.join(', ')}. Add them to .env and restart dashboard runtime.`
    );
  }

  const runtimeEnv = {} as DashboardRuntimeEnv;

  for (const requiredKey of REQUIRED_DASHBOARD_ENV_KEYS) {
    runtimeEnv[requiredKey] = normalizedSource[requiredKey] as string;
  }
  runtimeEnv.NEXT_PUBLIC_SUPABASE_URL = normalizedSource['NEXT_PUBLIC_SUPABASE_URL'] as string;
  runtimeEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY = normalizedSource['NEXT_PUBLIC_SUPABASE_ANON_KEY'] as string;

  return runtimeEnv;
}
