/**
 * Fase 3 of #1098 — the web target injects its build-time environment into the shared core.
 *
 * Same contract as the PWA (`apps/dashboard/src/app/runtime/configure-dashboard-environment.ts`):
 * the core cannot import a per-app generated `environments/environment.ts`, so the app hands it
 * over from the bootstrap. This module must be imported **before** `app/app.config`, because some
 * core modules read the runtime env at module scope.
 */
import { environment } from '../../environments/environment';
import { configureDashboardEnvironmentFallback } from '@orvel/dashboard-core/runtime/dashboard-env';

configureDashboardEnvironmentFallback({
  PUBLIC_SUPABASE_URL: environment.supabaseUrl,
  PUBLIC_SUPABASE_ANON_KEY: environment.supabaseAnonKey
});
