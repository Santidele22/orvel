export type OnboardingStep = 'plan' | 'account' | 'business-types' | 'welcome' | 'login' | 'dashboard';

export const ONBOARDING_STEP_KEY = 'turnea.onboarding.step.v1';
export const ONBOARDING_DASHBOARD_CUE_KEY = 'turnea.onboarding.dashboard-cue.v1';
export const ONBOARDING_COMPLETION_CONFIRMED_KEY = 'turnea.onboarding.completion-confirmed.v1';

const STEP_ORDER: Record<OnboardingStep, number> = {
  plan: 1,
  account: 2,
  'business-types': 3,
  welcome: 4,
  login: 5,
  dashboard: 6
};

export function canAccessStep(storage: Pick<Storage, 'getItem'>, step: OnboardingStep): boolean {
  const current = getCurrentStep(storage);
  if (STEP_ORDER[current] < STEP_ORDER[step]) {
    return false;
  }

  const completionConfirmed = storage.getItem(ONBOARDING_COMPLETION_CONFIRMED_KEY) === '1';
  const dashboardCue = storage.getItem(ONBOARDING_DASHBOARD_CUE_KEY) === '1';

  if (step === 'business-types') {
    return true;
  }

  if (step === 'welcome') {
    return completionConfirmed;
  }

  if (step === 'login') {
    return false;
  }

  if (step === 'dashboard') {
    return completionConfirmed && dashboardCue;
  }

  return true;
}

export function setCurrentStep(storage: Pick<Storage, 'setItem'>, step: OnboardingStep): void {
  storage.setItem(ONBOARDING_STEP_KEY, step);
}

export function getCurrentStep(storage: Pick<Storage, 'getItem'>): OnboardingStep {
  const raw = storage.getItem(ONBOARDING_STEP_KEY);
  if (raw === 'plan' || raw === 'account' || raw === 'business-types' || raw === 'welcome' || raw === 'login' || raw === 'dashboard') {
    return raw;
  }
  return 'plan';
}

export function markOnboardingCompletionConfirmed(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(ONBOARDING_COMPLETION_CONFIRMED_KEY, '1');
}
