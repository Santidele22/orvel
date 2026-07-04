import { ONBOARDING_BUSINESS_TYPES_STORAGE_KEY as ONBOARDING_BUSINESS_TYPES_KEY } from '../../features/onboarding/data-access/onboarding-business-types-storage';
import { ONBOARDING_PLAN_STORAGE_KEY as ONBOARDING_PLAN_KEY } from '../../features/onboarding/data-access/onboarding-plan-storage';
import { ONBOARDING_STORAGE_KEY as ONBOARDING_STATE_KEY } from '../../features/onboarding/data-access/onboarding-storage';

export const ACTIVE_BRANCH_STORAGE_KEY = 'activeBranchId';
export const ACTIVE_BUSINESS_STORAGE_KEY = 'orvel.active_business_id';
export const CLIENTES_FALLBACK_STORAGE_KEY = 'clientes:fallback';
export const SERVICIOS_FALLBACK_STORAGE_KEY = 'servicios:fallback';

export const ONBOARDING_STATE_STORAGE_KEY = ONBOARDING_STATE_KEY;
export const ONBOARDING_PLAN_STORAGE_KEY = ONBOARDING_PLAN_KEY;
export const ONBOARDING_BUSINESS_TYPES_STORAGE_KEY = ONBOARDING_BUSINESS_TYPES_KEY;

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
