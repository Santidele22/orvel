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

import type { RequiredRubro, TemplateCatalog } from '@orvel/domain';

export const LEGACY_DASHBOARD_SESSION_STORAGE_KEY = 'turnea.session.v1';

export interface TurneaSessionUser {
  id: string;
  email: string;
  name: string;
}

// D2 (chore-extract-domain-package): SelectedBusinessType is derived from the
// canonical @orvel/domain RequiredRubro type instead of a hardcoded literal
// union. The literal union used to duplicate the dashboard reference catalog
// here and drifted; deriving keeps it in sync (guarded by the
// packages-domain-shape + packages-auth-shape red contract specs).
//
// RequiredRubro is the canonical business-type code type from the dashboard
// reference catalog. Extracted dependency-free it widens to `string`, so the
// derivation is a direct alias (`RequiredRubro['businessType']` indexing in
// the design assumed an object shape; the real catalog-derived type is a
// string, making the direct alias the equivalent derivation). Type-level this
// is identical to the old union — which collapsed to `string` — so the
// `(string & {})` escape hatch for future catalog business types is preserved.
export type SelectedBusinessType = RequiredRubro;

// D2 (chore-extract-domain-package): RequiredRubro and TemplateCatalog were
// opaque stubs here; the domain extraction replaced them with the real
// definitions from @orvel/domain (packages/domain/src/required-rubro.ts and
// packages/domain/src/onboarding-templates.ts).
export type { RequiredRubro, TemplateCatalog } from '@orvel/domain';

export interface TurneaSession {
  version: string;
  token: string;
  user: TurneaSessionUser;
  selectedBusinessTypes: SelectedBusinessType[];
  // Rubro values are business-type codes (strings); the real RequiredRubro
  // type from @orvel/domain stays exported for consumers to reference.
  selectedRubros?: string[];
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
