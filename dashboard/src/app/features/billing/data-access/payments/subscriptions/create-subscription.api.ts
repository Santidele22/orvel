import type { PlanCode } from '../../../../../core/plans/plan-entitlements';

export type CreateSubscriptionInput = {
  planCode: PlanCode;
};

type EdgeCreateSubscriptionSuccess = {
  success: true;
  subscription: {
    id: string;
    status: 'pending' | 'active';
  };
  init_point: string | null;
  message: string;
};

type EdgeCreateSubscriptionFailure = {
  success?: false;
  error?: string;
  message?: string;
};

type EdgeCreateSubscriptionResponse = EdgeCreateSubscriptionSuccess | EdgeCreateSubscriptionFailure;

export type CreateSubscriptionResult = {
  ok: boolean;
  initPoint: string | null;
  subscriptionId: string;
  status: 'pending' | 'active';
  message: string;
};

export class CreateSubscriptionError extends Error {
  constructor(
    public readonly code:
      | 'UNAUTHENTICATED'
      | 'PLAN_NOT_FOUND'
      | 'VALIDATION_ERROR'
      | 'SERVER_CONFIG_ERROR'
      | 'RATE_LIMITED'
      | 'PROVIDER_ERROR'
      | 'NETWORK_ERROR'
      | 'UNKNOWN_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'CreateSubscriptionError';
  }
}

type InvokeResult = {
  data: EdgeCreateSubscriptionResponse | null;
  error: { message?: string; context?: { status?: number } } | null;
};

type CreateSubscriptionDeps = {
  invokeCreateSubscription?: (payload: { plan_code: PlanCode }) => Promise<InvokeResult>;
};

function isCreateSubscriptionSuccess(payload: EdgeCreateSubscriptionResponse | null): payload is EdgeCreateSubscriptionSuccess {
  return !!payload?.success;
}

function mapServerErrorToDeterministicError(input: {
  serverErrorCode?: string;
  statusCode?: number;
  message?: string;
}): CreateSubscriptionError {
  const code = input.serverErrorCode;

  if (input.statusCode === 429 || code === 'RATE_LIMIT_EXCEEDED') {
    return new CreateSubscriptionError('RATE_LIMITED', 'Demasiados intentos. Reintentá en un minuto.');
  }

  if (input.statusCode === 401 || code === 'AUTHORIZATION_REQUIRED' || code === 'INVALID_TOKEN') {
    return new CreateSubscriptionError('UNAUTHENTICATED', 'Tu sesión expiró. Volvé a iniciar sesión.');
  }

  if (input.statusCode === 400 || code === 'PLAN_CODE_REQUIRED' || code === 'INVALID_JSON') {
    return new CreateSubscriptionError('VALIDATION_ERROR', 'No pudimos validar el plan seleccionado.');
  }

  if (input.statusCode === 404 || code === 'PLAN_NOT_FOUND') {
    return new CreateSubscriptionError('PLAN_NOT_FOUND', 'El plan seleccionado no está disponible.');
  }

  if (code === 'PROVIDER_ERROR') {
    return new CreateSubscriptionError('PROVIDER_ERROR', 'No pudimos registrar el pago. Contactá soporte.');
  }

  if (input.statusCode && input.statusCode >= 500) {
    return new CreateSubscriptionError('UNKNOWN_ERROR', 'No pudimos iniciar la suscripción. Reintentá en unos segundos.');
  }

  return new CreateSubscriptionError(
    'UNKNOWN_ERROR',
    input.message?.trim() || 'No pudimos iniciar la suscripción. Reintentá en unos segundos.'
  );
}

function resolveDefaultInvoker(): (payload: { plan_code: PlanCode }) => Promise<InvokeResult> {
  return () => {
    throw new CreateSubscriptionError(
      'SERVER_CONFIG_ERROR',
      'Los pagos se coordinan manualmente. Contactá soporte.'
    );
  };
}

export async function createSubscription(
  input: CreateSubscriptionInput,
  deps: CreateSubscriptionDeps = {}
): Promise<CreateSubscriptionResult> {
  const invokeCreateSubscription = deps.invokeCreateSubscription ?? resolveDefaultInvoker();

  try {
    const { data, error } = await invokeCreateSubscription({
      plan_code: input.planCode
    });

    if (error) {
      throw mapServerErrorToDeterministicError({
        statusCode: error.context?.status,
        message: error.message
      });
    }

    const payload = data;
    if (!isCreateSubscriptionSuccess(payload) || !payload.subscription?.id || !payload.subscription.status) {
      const failurePayload = payload as EdgeCreateSubscriptionFailure | null;
      throw mapServerErrorToDeterministicError({
        serverErrorCode: failurePayload?.error,
        message: failurePayload?.message
      });
    }

    return {
      ok: true,
      initPoint: payload.init_point,
      subscriptionId: payload.subscription.id,
      status: payload.subscription.status,
      message: payload.message
    };
  } catch (error) {
    if (error instanceof CreateSubscriptionError) {
      throw error;
    }

    throw new CreateSubscriptionError('NETWORK_ERROR', 'Error de red al iniciar suscripción. Reintentá.');
  }
}
