import type { TurneaSession } from './session-contract';
import { sanitizeSelectedRubros } from '../onboarding/onboarding-rubros';
import {
  mergeTemplateCatalogs,
  sanitizeSelectedTemplateIds,
  TemplateCatalog
} from '../onboarding/onboarding-templates';

export const ALLOWED_SELECTED_BUSINESS_TYPES = ['zen'] as const;

export type SelectedBusinessType = (typeof ALLOWED_SELECTED_BUSINESS_TYPES)[number];

type MockLoginInput = {
  email: string;
  selectedBusinessTypes?: unknown;
  selectedRubros?: unknown;
  selectedTemplateIds?: unknown;
  preloadedCatalog?: unknown;
};

const MOCK_SESSION_DURATION_MS = 1000 * 60 * 60 * 8;

function isSelectedBusinessType(value: unknown): value is SelectedBusinessType {
  return (
    typeof value === 'string' &&
    ALLOWED_SELECTED_BUSINESS_TYPES.includes(value as SelectedBusinessType)
  );
}

export function sanitizeSelectedBusinessTypes(input: unknown): SelectedBusinessType[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<SelectedBusinessType>();

  for (const value of input) {
    if (isSelectedBusinessType(value)) {
      seen.add(value);
    }
  }

  return [...seen];
}

function buildDisplayNameFromEmail(email: string): string {
  const localPart = email.split('@')[0]?.trim();
  if (!localPart) {
    return 'Demo User';
  }

  return localPart
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function createMockSessionFromLogin(input: MockLoginInput): TurneaSession {
  const now = Date.now();
  const selectedBusinessTypes = sanitizeSelectedBusinessTypes(input.selectedBusinessTypes);
  const selectedRubros = sanitizeSelectedRubros(input.selectedRubros);
  const selectedTemplateIds = sanitizeSelectedTemplateIds(input.selectedTemplateIds);
  const preloadedCatalog = sanitizePreloadedCatalog(input.preloadedCatalog);

  return {
    version: 'v1',
    token: `mock.jwt.${now}`,
    user: {
      id: `mock-user-${now}`,
      email: input.email,
      name: buildDisplayNameFromEmail(input.email)
    },
    selectedBusinessTypes,
    selectedRubros,
    selectedTemplateIds,
    preloadedCatalog,
    issuedAt: now,
    expiresAt: now + MOCK_SESSION_DURATION_MS
  };
}

function sanitizePreloadedCatalog(input: unknown): TemplateCatalog {
  if (!input || typeof input !== 'object') {
    return { categories: [], services: [] };
  }

  const raw = input as Partial<TemplateCatalog>;

  return mergeTemplateCatalogs([
    {
      categories: Array.isArray(raw.categories) ? raw.categories : [],
      services: Array.isArray(raw.services) ? raw.services : []
    }
  ]);
}
