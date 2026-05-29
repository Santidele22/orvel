import type { PlanCode } from '../../../core/plans/plan-entitlements';
import { normalizePlanCode } from '../../../core/plans/plan-entitlements';
import { ONBOARDING_PLAN_STORAGE_KEY } from '../../onboarding/pages/signup-plan-step.page';
import {
  createSubscription,
  CreateSubscriptionError,
  type CreateSubscriptionResult
} from '../data-access/payments/subscriptions/create-subscription.api';

export const BILLING_CHECKOUT_UNAVAILABLE_MESSAGE =
  'Los pagos online no están disponibles en este momento. Contactá soporte para activar tu plan.';

const BILLING_CHECKOUT_GENERIC_ERROR_MESSAGE =
  'No pudimos iniciar el pago. Reintentá en unos minutos o contactá soporte.';

export type BillingCheckoutState =
  | { status: 'idle'; message: string }
  | { status: 'loading'; message: string }
  | { status: 'redirecting'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'error'; message: string };

type BillingCheckoutDeps = {
  storage?: Pick<Storage, 'getItem'> | null;
  createSubscription?: (input: { planCode: PlanCode }) => Promise<CreateSubscriptionResult>;
  redirectTo?: (url: string) => void;
};

export class BillingCheckoutPage {
  private readonly storage: Pick<Storage, 'getItem'> | null;
  private readonly createSubscriptionFn: (input: { planCode: PlanCode }) => Promise<CreateSubscriptionResult>;
  private readonly redirectTo: (url: string) => void;
  private currentState: BillingCheckoutState = {
    status: 'idle',
    message: 'Preparando el checkout seguro.'
  };

  constructor(deps: BillingCheckoutDeps = {}) {
    this.storage = deps.storage === undefined ? this.getBrowserStorage() : deps.storage;
    this.createSubscriptionFn = deps.createSubscription ?? createSubscription;
    this.redirectTo = deps.redirectTo ?? ((url) => window.location.assign(url));
  }

  state(): BillingCheckoutState {
    return this.currentState;
  }

  selectedPlan(): PlanCode {
    return normalizePlanCode(this.storage?.getItem(ONBOARDING_PLAN_STORAGE_KEY)) as PlanCode;
  }

  async startCheckout(): Promise<void> {
    this.currentState = {
      status: 'loading',
      message: 'Iniciando suscripción segura…'
    };

    try {
      const result = await this.createSubscriptionFn({ planCode: this.selectedPlan() });

      if (!result.ok || !result.initPoint) {
        this.currentState = {
          status: 'unavailable',
          message: BILLING_CHECKOUT_UNAVAILABLE_MESSAGE
        };
        return;
      }

      this.currentState = {
        status: 'redirecting',
        message: 'Redirigiendo a Mercado Pago…'
      };
      this.redirectTo(result.initPoint);
    } catch (error) {
      if (error instanceof CreateSubscriptionError && error.code === 'SERVER_CONFIG_ERROR') {
        this.currentState = {
          status: 'unavailable',
          message: BILLING_CHECKOUT_UNAVAILABLE_MESSAGE
        };
        return;
      }

      this.currentState = {
        status: 'error',
        message: error instanceof CreateSubscriptionError ? error.message : BILLING_CHECKOUT_GENERIC_ERROR_MESSAGE
      };
    }
  }

  private getBrowserStorage(): Storage | null {
    if (typeof window === 'undefined') {
      return null;
    }

    return window.localStorage ?? null;
  }
}
