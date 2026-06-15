import {
  ALLOWED_SELECTED_BUSINESS_TYPES,
  SelectedBusinessType
} from './mock-login-business-types';
import type { RequiredRubro } from '../../features/onboarding/data-access/onboarding-rubros';
import type { TemplateCatalog } from '../../features/onboarding/data-access/onboarding-templates';

export const TURNERA_SESSION_KEY = 'turnea.session.v1';

export interface TurneaSessionUser {
  id: string;
  email: string;
  name: string;
}

export interface TurneaSession {
  version: string;
  token: string;
  user: TurneaSessionUser;
  selectedBusinessTypes: SelectedBusinessType[];
  selectedRubros?: RequiredRubro[];
  selectedTemplateIds?: string[];
  preloadedCatalog?: TemplateCatalog;
  issuedAt: number;
  expiresAt: number;
}

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
