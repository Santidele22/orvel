import { browserEnvironment } from '../platform/browser-environment.adapter';
import {
  REQUIRED_DASHBOARD_ENV_KEYS,
  hasRequiredDashboardEnv,
  loadDashboardRuntimeEnv as loadRequiredDashboardRuntimeEnv,
  type DashboardRuntimeEnv,
  type EnvSource,
} from '@orvel/config';

export { REQUIRED_DASHBOARD_ENV_KEYS, type DashboardRuntimeEnv };

/**
 * Fase 3 of #1098 — the build-time fallback is injected, not imported.
 *
 * This module used to import `src/environments/environment`, which is generated per app and
 * swapped by `angular.json`, so the core could not live in a shared package. Each app now calls
 * `configureDashboardEnvironmentFallback()` from its bootstrap, and the resolution order stays
 * exactly as before: process env, then the document-injected runtime env, then this fallback.
 */
let environmentFallback: EnvSource = {};

export function configureDashboardEnvironmentFallback(source: EnvSource): void {
  environmentFallback = { ...source };
}

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

  return environmentFallback;
}

export function loadDashboardRuntimeEnv(source?: EnvSource): DashboardRuntimeEnv {
  return loadRequiredDashboardRuntimeEnv(source ?? defaultEnvSource());
}
