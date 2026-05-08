export type CheckoutTriggerState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'redirecting'; redirectUrl: string }
  | { status: 'retryable_error'; message: string };

export type CreateCheckoutProTriggerControllerDeps = {
  createPreference: () => Promise<{ initPoint: string }>;
  redirectToUrl: (url: string) => void;
  mapErrorToMessage?: (error: unknown) => string;
};

export type CheckoutProTriggerController = {
  getState: () => CheckoutTriggerState;
  onPayClick: () => Promise<void>;
};

export type CreateCheckoutProSubscriptionTriggerControllerDeps = {
  createSubscription: () => Promise<{ initPoint: string | null }>;
  redirectToUrl: (url: string) => void;
  mapErrorToMessage?: (error: unknown) => string;
};

const DEFAULT_RETRYABLE_MESSAGE = 'No pudimos iniciar el pago. Reintentá en unos segundos.';

function defaultMapErrorToMessage(): string {
  return DEFAULT_RETRYABLE_MESSAGE;
}

export function createCheckoutProTriggerController(
  deps: CreateCheckoutProTriggerControllerDeps
): CheckoutProTriggerController {
  let state: CheckoutTriggerState = { status: 'idle' };

  return {
    getState: () => state,
    onPayClick: async () => {
      state = { status: 'loading' };

      try {
        const response = await deps.createPreference();
        state = {
          status: 'redirecting',
          redirectUrl: response.initPoint
        };
        deps.redirectToUrl(response.initPoint);
      } catch (error) {
        state = {
          status: 'retryable_error',
          message: (deps.mapErrorToMessage ?? defaultMapErrorToMessage)(error)
        };
      }
    }
  };
}

export function createCheckoutProSubscriptionTriggerController(
  deps: CreateCheckoutProSubscriptionTriggerControllerDeps
): CheckoutProTriggerController {
  return createCheckoutProTriggerController({
    createPreference: async () => {
      const response = await deps.createSubscription();

      if (!response.initPoint) {
        throw new Error('SUBSCRIPTION_INIT_POINT_MISSING');
      }

      return { initPoint: response.initPoint };
    },
    redirectToUrl: deps.redirectToUrl,
    mapErrorToMessage: deps.mapErrorToMessage
  });
}
