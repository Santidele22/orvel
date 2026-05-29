export type OnboardingStep = 'plan' | 'account' | 'business-types' | 'welcome' | 'login' | 'dashboard';

export const ONBOARDING_STEP_KEY = 'turnea.onboarding.step.v1';
export const ONBOARDING_ACCOUNT_METHOD_KEY = 'turnea.onboarding.account-method.v1';
export const ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY = 'turnea.onboarding.welcome-email-triggered.v1';
export const ONBOARDING_DASHBOARD_CUE_KEY = 'turnea.onboarding.dashboard-cue.v1';

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

  const accountMethod = storage.getItem(ONBOARDING_ACCOUNT_METHOD_KEY);
  const hasValidAccountMethod = accountMethod === 'manual' || accountMethod === 'google';
  const welcomeTriggered = storage.getItem(ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY) === '1';
  const dashboardCue = storage.getItem(ONBOARDING_DASHBOARD_CUE_KEY) === '1';

  if (step === 'business-types') {
    return hasValidAccountMethod;
  }

  if (step === 'welcome') {
    return welcomeTriggered;
  }

  if (step === 'login') {
    return hasValidAccountMethod && welcomeTriggered && dashboardCue;
  }

  if (step === 'dashboard') {
    return hasValidAccountMethod && welcomeTriggered && dashboardCue;
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

export function markWelcomeEmailTriggeredOnce(storage: Pick<Storage, 'getItem' | 'setItem'>): boolean {
  const alreadyTriggered = storage.getItem(ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY) === '1';
  if (alreadyTriggered) {
    return false;
  }

  storage.setItem(ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY, '1');
  return true;
}
