/**
 * Fase 3 of #1098 — the web target shares the dashboard's generated environment for now.
 *
 * `apps/dashboard/scripts/generate-dashboard-env.mjs` writes
 * `apps/dashboard/src/environments/environment.generated.ts`, and `angular.json` swaps this module
 * for it in every build configuration, exactly like the PWA does. Fase 4 gives the web target its
 * own origin and its own values; until then there is one Supabase project behind both targets.
 */
export { environment } from '../../../dashboard/src/environments/environment';
