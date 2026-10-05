import { environment } from '../../../environments/environment';
import { browserEnvironment } from '../platform/browser-environment.adapter';
import {
  REQUIRED_DASHBOARD_ENV_KEYS,
  hasRequiredDashboardEnv,
  loadDashboardRuntimeEnv as loadRequiredDashboardRuntimeEnv,
  type DashboardRuntimeEnv,
  type EnvSource,
} from '@orvel/config';

export { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv };

/** The document injects this script; who validates it is `hasRequiredDashboardEnv`. */
function readHostDashboardEnv(): EnvSource | undefined {
  return browserEnvironment().runtimeEnv() as EnvSource | undefined;
}

function defaultEnvSource(): EnvSource {
  const maybeProcess = globalThis as {
    process?: {
      env?: EnvSource;
    };
  };
  const processEnv = maybeProcess.process?.env;

  if (processEnv && hasRequiredDashboardEnv(processEnv)) {
    return processEnv;
  }

  const windowEnv = readHostDashboardEnv();
  if (windowEnv && hasRequiredDashboardEnv(windowEnv)) {
    return windowEnv;
  }

  return {
    PUBLIC_SUPABASE_URL: environment.supabaseUrl,
    PUBLIC_SUPABASE_ANON_KEY: environment.supabaseAnonKey,
  };
}

export function loadDashboardRuntimeEnv(source?: EnvSource): DashboardRuntimeEnv {
  return loadRequiredDashboardRuntimeEnv(source ?? defaultEnvSource());
}
