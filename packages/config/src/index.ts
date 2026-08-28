// @orvel/config public surface barrel.
// Import-free runtime env helpers; see packages/config/README.md.

export {
  REQUIRED_DASHBOARD_ENV_KEYS,
  hasRequiredDashboardEnv,
  loadDashboardRuntimeEnv,
  withLegacyPublicSupabaseAliases,
  type DashboardRuntimeEnv,
  type EnvSource,
} from './dashboard-env';

export { ORVEL_SUPABASE_AUTH_STORAGE_KEY } from './supabase-storage-key';
