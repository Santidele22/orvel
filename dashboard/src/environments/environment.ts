/**
 * Development/default environment module.
 *
 * Supabase values are never hardcoded here. `scripts/generate-dashboard-env.mjs`
 * writes `environment.generated.ts` from the process env and the repo `.env`
 * files, and `angular.json` swaps this module for that generated file in every
 * build and serve configuration.
 *
 * Runtime resolution order lives in `src/app/core/runtime/dashboard-env.ts`:
 * process env, then `window.__ORVEL_DASHBOARD_ENV__`, then this module.
 */
export const environment = {
  production: false,
  supabaseUrl: '',
  supabaseAnonKey: ''
};
