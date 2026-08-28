import {
  ALLOWED_SELECTED_BUSINESS_TYPES,
  SelectedBusinessType
} from './mock-login-business-types';
import type { TurneaSession, TurneaSessionUser } from '@orvel/auth';

/**
 * Runtime body of `validateSessionSchema`.
 *
 * Extracted to `apps/dashboard/src/app/core/auth/` because it depends on
 * app-internal `ALLOWED_SELECTED_BUSINESS_TYPES` (derived from onboarding
 * reference catalog). The type signature lives in `@orvel/auth`.
 *
 * See sdd-design D1 for the split rationale.
 */
export function validateSessionSchema(input: unknown, now = Date.now()): input is TurneaSession {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const session = input as Partial<TurneaSession>;
  const user = session.user as Partial<TurneaSessionUser> | undefined;
  const issuedAt = session.issuedAt;
  const expiresAt = session.expiresAt;
  const selectedBusinessTypes = session.selectedBusinessTypes;

  const hasValidSelectedBusinessTypes =
    Array.isArray(selectedBusinessTypes) &&
    selectedBusinessTypes.every(
      (value) =>
        typeof value === 'string' &&
        ALLOWED_SELECTED_BUSINESS_TYPES.includes(value as SelectedBusinessType)
    );

  const hasSchema =
    session.version === 'v1' &&
    typeof session.token === 'string' &&
    session.token.length > 0 &&
    typeof issuedAt === 'number' &&
    Number.isFinite(issuedAt) &&
    typeof expiresAt === 'number' &&
    Number.isFinite(expiresAt) &&
    !!user &&
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.name === 'string' &&
    hasValidSelectedBusinessTypes;

  if (!hasSchema) {
    return false;
  }

  return expiresAt > now;
}
