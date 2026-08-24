import { environment } from '../../../environments/environment';
import {
  REQUIRED_DASHBOARD_ENV_KEYS,
  hasRequiredDashboardEnv,
  loadDashboardRuntimeEnv as loadRequiredDashboardRuntimeEnv,
  type DashboardRuntimeEnv,
  type EnvSource,
} from '@orvel/config';

export { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv };

type DashboardWindow = {
  __ORVEL_DASHBOARD_ENV__?: EnvSource;
};

function readWindowDashboardEnv(): EnvSource | undefined {
  const maybeWindow = globalThis as { window?: DashboardWindow };
  return maybeWindow.window?.__ORVEL_DASHBOARD_ENV__;
}

type DashboardWindow = {
  __ORVEL_DASHBOARD_ENV__?: EnvSource;
};

function readWindowDashboardEnv(): EnvSource | undefined {
  const maybeWindow = globalThis as { window?: DashboardWindow };
  return maybeWindow.window?.__ORVEL_DASHBOARD_ENV__;
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

  const windowEnv = readWindowDashboardEnv();
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
