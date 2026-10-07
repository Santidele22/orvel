/**
 * Fase 3 of #1098 — the web target injects its build-time environment into the shared core.
 *
 * Same contract as the PWA (`apps/dashboard/src/app/runtime/configure-dashboard-environment.ts`):
 * the core cannot import a per-app generated `environments/environment.ts`, so the app hands it
 * over from the bootstrap. This module must be imported **before** `app/app.config`, because some
 * core modules read the runtime env at module scope.
 *
 * Fase 4 of #1098 — it also declares this app's execution target, so the console keeps its own
 * session key instead of the pwa's (ADR 0012). This target is not deployed yet, so the distinct key
 * costs nothing today and closes the console half of audit finding S2 when it moves to its origin.
 */
import { environment } from '../../environments/environment';
import { configureDashboardEnvironmentFallback } from '@orvel/dashboard-core/runtime/dashboard-env';
import { configureDashboardAuthTarget } from '@orvel/dashboard-core/auth/dashboard-auth-target';

configureDashboardEnvironmentFallback({
  PUBLIC_SUPABASE_URL: environment.supabaseUrl,
  PUBLIC_SUPABASE_ANON_KEY: environment.supabaseAnonKey
});

configureDashboardAuthTarget('web');
