/**
 * Fase 3 of #1098 — the app injects its build-time environment into the core.
 *
 * `src/environments/environment.ts` (and its generated twin) is generated per app: it is read
 * from the repo env at build time and swapped by `angular.json`. The shared core cannot import it,
 * so the app hands it over from its bootstrap instead.
 *
 * This module must be imported **before** `app/app.config`, because some core modules
 * (`core/auth/supabase-config.ts`) read the runtime env at module scope.
 *
 * Fase 4 of #1098 — it also declares which execution target this app is, so the core resolves the
 * pwa's own session key instead of a key shared with the landing and the console (ADR 0012).
 */
import { environment } from '../../environments/environment';
import { configureDashboardEnvironmentFallback } from '@orvel/dashboard-core/runtime/dashboard-env';
import { configureDashboardAuthTarget } from '@orvel/dashboard-core/auth/dashboard-auth-target';

configureDashboardEnvironmentFallback({
  PUBLIC_SUPABASE_URL: environment.supabaseUrl,
  PUBLIC_SUPABASE_ANON_KEY: environment.supabaseAnonKey
});

configureDashboardAuthTarget('pwa');
