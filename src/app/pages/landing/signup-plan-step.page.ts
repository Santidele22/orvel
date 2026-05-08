/**
 * Signup Plan Step Page - Pure Business Logic
 *
 * Contains the pure class without Angular dependencies.
 * This file can be imported by tests without Angular compilation.
 */
import type { PlanCode } from '../../core/plans/plan-entitlements';
import { getLandingPlansFallback } from '../../core/billing/landing-plans-source.api';
import { normalizePlanCode } from '../../core/plans/plan-entitlements';
import { setCurrentStep } from '../../core/onboarding/onboarding-flow-state';

// Re-export PlanCode for convenience
export { PlanCode };

export type PlanOption = {
  code: PlanCode;
  label: string;
  priceMonthlyCents: number;
  maxLocales: number;
  maxRubros: number;
  checkoutProvider: 'mercado_pago';
};

// Storage key per KBN-004.5.4 spec
export const ONBOARDING_PLAN_STORAGE_KEY = 'turnea.onboarding.v1';

// Pure storage functions
function persistPlanSelectionInternal(storage: Pick<Storage, 'setItem'>, plan: PlanCode): void {
  storage.setItem(ONBOARDING_PLAN_STORAGE_KEY, plan);
}

function readPlanSelectionInternal(storage: Pick<Storage, 'getItem'>): PlanCode | null {
  const stored = storage.getItem(ONBOARDING_PLAN_STORAGE_KEY);
  if (!stored) {
    return null;
  }
  return normalizePlanCode(stored);
}

/**
 * Signup Plan Step Page - Pure Business Logic Class
 *
 * Step 1 of the onboarding flow - Plan Selection.
 * User must select one of 3 plans (STARTER, GROWTH, PRO) to continue.
 *
 * Flow:
 * 1. User views 4 plan cards with features/limits
 * 2. User selects one plan (single selection)
 * 3. Continue button becomes enabled
 * 4. On submit, plan is persisted to onboarding storage
 * 5. Navigation to Step 2 (credentials/profile)
 */
export class SignupPlanStepPage {
  /** Available plans - matches PLAN_ENTITLEMENTS */
  protected readonly plans: PlanOption[] = getLandingPlansFallback().map((plan) => ({
    code: plan.code,
    label: plan.name,
    priceMonthlyCents: plan.priceMonthlyCents,
    maxLocales: plan.maxLocales,
    maxRubros: plan.maxRubros,
    checkoutProvider: plan.checkoutProvider
  }));

  /** Currently selected plan (null = no selection) */
  protected selectedPlan: PlanCode | null = null;

  // Router reference for navigation
  private routerRef: { navigateByUrl: (url: string) => void } | null = null;

  /**
   * Sets the router instance (for testability and production)
   */
  setRouter(router: { navigateByUrl: (url: string) => void }): void {
    this.routerRef = router;
  }

  /**
   * Checks if a specific plan is selected
   */
  isPlanSelected(plan: PlanCode): boolean {
    return this.selectedPlan === plan;
  }

  /**
   * Selects a plan, replacing any previous selection
   */
  selectPlan(plan: PlanCode): void {
    this.selectedPlan = plan;
  }

  /**
   * Checks if user can proceed to next step
   */
  canContinue(): boolean {
    return this.selectedPlan !== null;
  }

  /**
   * Formats plan price for display in the landing plan cards.
   */
  formatMonthlyPrice(priceMonthlyCents: number): string {
    if (priceMonthlyCents <= 0) {
      return 'Gratis';
    }

    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(priceMonthlyCents / 100);
  }

  /**
   * Handles continue action - persists plan and navigates
   */
  continue(): void {
    if (!this.canContinue() || !this.selectedPlan) {
      return;
    }

    const storage = this.getStorage();
    if (storage) {
      persistPlanSelectionInternal(storage, this.selectedPlan);
      setCurrentStep(storage, 'account');
    }

    if (this.routerRef) {
      this.routerRef.navigateByUrl('/auth/signup/credentials');
    }
  }

  /**
   * Handles back navigation
   */
  goBack(): void {
    if (this.routerRef) {
      this.routerRef.navigateByUrl('/auth/signup/start');
    }
  }

  /**
   * Gets storage object
   */
  protected getStorage(): Storage | null {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
    return null;
  }

  constructor() {
    const storage = this.getStorage();
    if (storage) {
      const persisted = readPlanSelectionInternal(storage);
      if (persisted) {
        this.selectedPlan = persisted;
      }
    }
  }
}

// Re-export storage functions for external use
export function persistPlanSelection(storage: Pick<Storage, 'setItem'>, plan: PlanCode): void {
  persistPlanSelectionInternal(storage, plan);
}

export function readPlanSelection(storage: Pick<Storage, 'getItem'>): PlanCode | null {
  return readPlanSelectionInternal(storage);
}
