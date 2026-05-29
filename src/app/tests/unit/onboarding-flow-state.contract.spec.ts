import { describe, expect, it } from 'vitest';

import {
  ONBOARDING_ACCOUNT_METHOD_KEY,
  ONBOARDING_DASHBOARD_CUE_KEY,
  ONBOARDING_STEP_KEY,
  ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY,
  canAccessStep
} from '../../features/onboarding/data-access/onboarding-flow-state';

function storageFrom(values: Record<string, string>): Pick<Storage, 'getItem'> {
  return {
    getItem: (key: string) => values[key] ?? null
  };
}

describe('onboarding flow state contract', () => {
  it('does not grant login step with forged step key alone', () => {
    const storage = storageFrom({
      [ONBOARDING_STEP_KEY]: 'login'
    });

    expect(canAccessStep(storage, 'login')).toBe(false);
  });

  it('requires completion evidence before allowing welcome/login checkpoints', () => {
    const missingWelcomeEvidence = storageFrom({
      [ONBOARDING_STEP_KEY]: 'welcome'
    });
    expect(canAccessStep(missingWelcomeEvidence, 'welcome')).toBe(false);

    const withWelcomeEvidence = storageFrom({
      [ONBOARDING_STEP_KEY]: 'welcome',
      [ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY]: '1'
    });
    expect(canAccessStep(withWelcomeEvidence, 'welcome')).toBe(true);

    const withLoginEvidence = storageFrom({
      [ONBOARDING_STEP_KEY]: 'login',
      [ONBOARDING_WELCOME_EMAIL_TRIGGERED_KEY]: '1',
      [ONBOARDING_DASHBOARD_CUE_KEY]: '1',
      [ONBOARDING_ACCOUNT_METHOD_KEY]: 'google'
    });
    expect(canAccessStep(withLoginEvidence, 'login')).toBe(true);
  });
});
