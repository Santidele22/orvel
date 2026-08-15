// @orvel/auth — session contract types
//
// First extraction of the 7-package pattern (auth, billing, booking, config,
// domain, shared, types) staging a future hexagonal architecture.
//
// This file is types-only. The runtime body of `validateSessionSchema`
// remains in apps/dashboard/src/app/core/auth/validate-session-schema.ts
// because it depends on ALLOWED_SELECTED_BUSINESS_TYPES (which itself
// derives from app-internal onboarding reference catalog).
// See sdd-design D1 for the split rationale.

export const LEGACY_DASHBOARD_SESSION_STORAGE_KEY = 'turnea.session.v1';

export interface TurneaSessionUser {
  id: string;
  email: string;
  name: string;
}

// D2: SelectedBusinessType is declared as a string literal union here because
// the runtime source (REQUIRED_RUBROS, derived from onboarding reference
// catalog) is app-internal and lives in the dashboard. The values below are
// the business types known as of release-1.0.4 plan (uñas, peluquería,
// barbería, masajes, estética, cejas/pestañas, spa). New business types
// added via onboarding catalog will require a sync here; this drift is
// caught by packages-auth-shape.red.contract.spec.ts.
export type SelectedBusinessType =
  | 'uñas'
  | 'peluquería'
  | 'barbería'
  | 'masajes'
  | 'estética'
  | 'cejas/pestañas'
  | 'spa'
  | 'otro'
  | (string & {}); // escape hatch for future types added via catalog

// D2: RequiredRubro and TemplateCatalog are opaque shapes here. Their full
// definitions live in apps/dashboard (onboarding-rubros, onboarding-templates)
// and are app-internal. The opaque shapes here exist so consumers can
// reference the types. When packages/domain and packages/types are extracted
// (the next 6 packages in this pattern), these can be replaced with the
// real definitions.
export interface RequiredRubro {
  [key: string]: unknown;
}

export interface TemplateCatalog {
  [key: string]: unknown;
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

// D1: type signature only. Runtime body lives in
// apps/dashboard/src/app/core/auth/validate-session-schema.ts.
export type ValidateSessionSchema = (
  input: unknown,
  now?: number,
) => input is TurneaSession;
