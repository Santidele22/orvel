import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { canAccessStep } from './onboarding-flow-state';

function storage(): Storage | null {
  if (typeof window !== 'undefined' && window.localStorage) {
    return window.localStorage;
  }
  return null;
}

function createGuard(step: 'account' | 'business-types' | 'welcome' | 'login'): CanActivateFn {
  return () => {
    const router = inject(Router);
    const local = storage();
    if (!local) {
      return true;
    }

    if (!canAccessStep(local, step)) {
      return router.parseUrl('/auth/signup/plan');
    }

    return true;
  };
}

export const onboardingAccountGuard = createGuard('account');
export const onboardingBusinessTypesGuard = createGuard('business-types');
export const onboardingWelcomeGuard = createGuard('welcome');
export const onboardingLoginGuard = createGuard('login');
