export const REQUIRED_DASHBOARD_ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY'] as const;
export const OPTIONAL_SERVER_ENV_KEYS = ['SUPABASE_SERVICE_ROLE_KEY'] as const;

type RequiredDashboardEnvKey = (typeof REQUIRED_DASHBOARD_ENV_KEYS)[number];
type OptionalServerEnvKey = (typeof OPTIONAL_SERVER_ENV_KEYS)[number];

export type DashboardRuntimeEnv = Record<RequiredDashboardEnvKey, string> &
  Partial<Record<OptionalServerEnvKey, string>>;

type EnvSource = Record<string, string | undefined>;

import { environment } from '../../../environments/environment';

function defaultEnvSource(): EnvSource {
  const maybeProcess = globalThis as {
    process?: {
      env?: EnvSource;
    };
  };

  return maybeProcess.process?.env ?? {
    NEXT_PUBLIC_SUPABASE_URL: environment.supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: environment.supabaseAnonKey,
  };
}

function isMissing(value: string | undefined): boolean {
  return !value || value.trim().length === 0;
}

export function loadDashboardRuntimeEnv(source: EnvSource = defaultEnvSource()): DashboardRuntimeEnv {
  const missing = REQUIRED_DASHBOARD_ENV_KEYS.filter((key) => isMissing(source[key]));

  if (missing.length > 0) {
    throw new Error(
      `[dashboard-env] Missing required env vars: ${missing.join(', ')}. Add them to .env and restart dashboard runtime.`
    );
  }

  const runtimeEnv = {} as DashboardRuntimeEnv;

  for (const requiredKey of REQUIRED_DASHBOARD_ENV_KEYS) {
    runtimeEnv[requiredKey] = source[requiredKey] as string;
  }

  for (const optionalKey of OPTIONAL_SERVER_ENV_KEYS) {
    const optionalValue = source[optionalKey];
    if (!isMissing(optionalValue)) {
      runtimeEnv[optionalKey] = optionalValue;
    }
  }

  return runtimeEnv;
}
