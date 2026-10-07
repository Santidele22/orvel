// Re-export shim for the auth package migration window (chore-extract-auth-package).
// Types live in @orvel/auth; runtime body lives in ./validate-session-schema.ts.
// Kept for the migration window; delete after consumer migration is verified.

export {
  LEGACY_DASHBOARD_SESSION_STORAGE_KEY,
  type TurneaSession,
  type TurneaSessionUser,
  type SelectedBusinessType,
  type RequiredRubro,
  type TemplateCatalog,
  type ValidateSessionSchema
} from '@orvel/auth';

export { validateSessionSchema } from './validate-session-schema';
