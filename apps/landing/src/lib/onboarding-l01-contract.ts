import type { PlanCode } from './plan-entitlements';
import { PLAN_ENTITLEMENTS, resolvePlanCode } from './plan-entitlements';

export type OnboardingStep = 'profile' | 'business' | 'plan' | 'review';

export type OnboardingDraft = {
  firstName: string;
  lastName: string;
  businessType: string;
  salonNames: string[];
  selectedPlan: PlanCode | '';
};

export type FieldErrors = Partial<
  Record<'firstName' | 'lastName' | 'businessType' | 'salonNames' | 'selectedPlan', string>
>;

export type OnboardingValidationResult = {
  valid: boolean;
  fieldErrors: FieldErrors;
};

export type OnboardingStepState = {
  currentStep: OnboardingStep;
  draft: OnboardingDraft;
};

export type OnboardingPlanUxContract = {
  plan: PlanCode;
  multiSalonEnabled: boolean;
  maxSalons: number;
  salonNamesHint: string;
};

export type NormalizedOnboardingPayload = {
  firstName: string;
  lastName: string;
  businessType: string;
  salonNames: string[];
  selectedPlan: PlanCode;
};

export const ONBOARDING_STEPS: OnboardingStep[] = ['profile', 'business', 'plan', 'review'];

function sanitizeText(value: string): string {
  return value.trim();
}

function sanitizeBusinessType(value: string): string {
  return sanitizeText(value).toLowerCase();
}

function sanitizeSalonNames(values: string[]): string[] {
  const seen = new Set<string>();
  const sanitized: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }

    const dedupeKey = trimmed.toLowerCase();
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    sanitized.push(trimmed);
  }

  return sanitized;
}

function getMaxSalonsForPlan(plan: OnboardingDraft['selectedPlan']): number {
  if (!plan) {
    return PLAN_ENTITLEMENTS.FREE.maxLocales;
  }

  return PLAN_ENTITLEMENTS[plan].maxLocales;
}

export function createOnboardingDraft(): OnboardingDraft {
  return {
    firstName: '',
    lastName: '',
    businessType: '',
    salonNames: [],
    selectedPlan: ''
  };
}

export function validateOnboardingDraft(draft: OnboardingDraft): OnboardingValidationResult {
  const fieldErrors: FieldErrors = {};

  const firstName = sanitizeText(draft.firstName);
  const lastName = sanitizeText(draft.lastName);
  const businessType = sanitizeBusinessType(draft.businessType);
  const salonNames = sanitizeSalonNames(draft.salonNames);

  if (!firstName) {
    fieldErrors.firstName = 'First name is required.';
  }

  if (!lastName) {
    fieldErrors.lastName = 'Last name is required.';
  }

  if (!businessType) {
    fieldErrors.businessType = 'Business type is required.';
  }

  if (salonNames.length === 0) {
    fieldErrors.salonNames = 'At least one salon name is required.';
  }

  if (!draft.selectedPlan) {
    fieldErrors.selectedPlan = 'Plan is required.';
  }

  const maxSalons = getMaxSalonsForPlan(draft.selectedPlan);
  if (salonNames.length > maxSalons) {
    fieldErrors.salonNames = `Plan limit exceeded: ${maxSalons} salon${maxSalons === 1 ? '' : 's'} maximum.`;
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors
  };
}

export function canContinueToNextStep(state: OnboardingStepState): boolean {
  const draft = state.draft;

  if (state.currentStep === 'profile') {
    return Boolean(sanitizeText(draft.firstName) && sanitizeText(draft.lastName));
  }

  if (state.currentStep === 'business') {
    return Boolean(sanitizeBusinessType(draft.businessType) && sanitizeSalonNames(draft.salonNames).length > 0);
  }

  if (state.currentStep === 'plan') {
    const maxSalons = getMaxSalonsForPlan(draft.selectedPlan);
    const salonCount = sanitizeSalonNames(draft.salonNames).length;
    return Boolean(draft.selectedPlan) && salonCount > 0 && salonCount <= maxSalons;
  }

  return false;
}

export function nextStep(state: OnboardingStepState): OnboardingStepState {
  const currentIndex = ONBOARDING_STEPS.indexOf(state.currentStep);
  if (currentIndex < 0) {
    return state;
  }

  const nextIndex = Math.min(currentIndex + 1, ONBOARDING_STEPS.length - 1);
  return {
    currentStep: ONBOARDING_STEPS[nextIndex],
    draft: state.draft
  };
}

export function previousStep(state: OnboardingStepState): OnboardingStepState {
  const currentIndex = ONBOARDING_STEPS.indexOf(state.currentStep);
  if (currentIndex < 0) {
    return state;
  }

  const previousIndex = Math.max(currentIndex - 1, 0);
  return {
    currentStep: ONBOARDING_STEPS[previousIndex],
    draft: state.draft
  };
}

export function getPlanUxContract(plan: PlanCode): OnboardingPlanUxContract {
  const resolvedPlan = resolvePlanCode(plan);
  const maxSalons = PLAN_ENTITLEMENTS[resolvedPlan].maxLocales;

  return {
    plan: resolvedPlan,
    multiSalonEnabled: false,
    maxSalons,
    salonNamesHint: `Plan ${resolvedPlan}: 1 salón incluido. Los locales adicionales se gestionan como add-on o por consulta con Orvel.`
  };
}

export function canSubmitOnboarding(draft: OnboardingDraft): boolean {
  return validateOnboardingDraft(draft).valid;
}

export function normalizeOnboardingPayload(draft: OnboardingDraft): NormalizedOnboardingPayload {
  return {
    firstName: sanitizeText(draft.firstName),
    lastName: sanitizeText(draft.lastName),
    businessType: sanitizeBusinessType(draft.businessType),
    salonNames: sanitizeSalonNames(draft.salonNames),
    selectedPlan: resolvePlanCode(draft.selectedPlan)
  };
}
