/**
 * Browser storage keys owned by `core`.
 *
 * Canonical key values live here so that `core/*` never imports a feature.
 * The onboarding feature modules (`features/onboarding/data-access/*`) re-export
 * the onboarding keys, so their public surface is unchanged.
 */

export const ACTIVE_BRANCH_STORAGE_KEY = 'activeBranchId';
export const ACTIVE_BUSINESS_STORAGE_KEY = 'orvel.active_business_id';
export const CLIENTES_FALLBACK_STORAGE_KEY = 'clientes:fallback';
export const SERVICIOS_FALLBACK_STORAGE_KEY = 'servicios:fallback';

export const ONBOARDING_STORAGE_KEY = 'turnea.onboarding.v1';
export const ONBOARDING_PLAN_STORAGE_KEY = 'turnea.onboarding.plan';
export const ONBOARDING_BUSINESS_TYPES_STORAGE_KEY = 'turnea.onboarding.rubros.v1';

/** Onboarding state key under its historical core-side name. */
export const ONBOARDING_STATE_STORAGE_KEY = ONBOARDING_STORAGE_KEY;

export const DASHBOARD_BROWSER_STORAGE_KEYS = {
  activeBranch: ACTIVE_BRANCH_STORAGE_KEY,
  activeBusiness: ACTIVE_BUSINESS_STORAGE_KEY,
  degradedFallbacks: {
    clientes: CLIENTES_FALLBACK_STORAGE_KEY,
    servicios: SERVICIOS_FALLBACK_STORAGE_KEY
  },
  onboarding: {
    state: ONBOARDING_STATE_STORAGE_KEY,
    plan: ONBOARDING_PLAN_STORAGE_KEY,
    businessTypes: ONBOARDING_BUSINESS_TYPES_STORAGE_KEY
  }
} as const;
