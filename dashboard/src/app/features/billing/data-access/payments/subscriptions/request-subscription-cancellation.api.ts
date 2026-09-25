export type SubscriptionCancellationReason = 'manual_request' | 'too_expensive' | 'missing_features' | 'other';

export type RequestSubscriptionCancellationInput = {
  businessId: string;
  reason?: SubscriptionCancellationReason;
  mode?: 'subscription_cancellation' | 'account_cancellation';
};

type EdgeCancellationRequestSuccess = {
  success: true;
  message: string;
  request: {
    status: 'manual_review' | 'already_requested' | 'scheduled_account_closure';
    requested_at: string | null;
    reason: SubscriptionCancellationReason | string;
  };
  subscription: {
    id: string;
    status: string;
    period_end: string | null;
    provider_subscription_id?: string | null;
  };
};

type EdgeCancellationRequestFailure = {
  success?: false;
  error?: string;
  message?: string;
};

type EdgeCancellationRequestResponseWithAccountClosure = EdgeCancellationRequestSuccess & {
  account_closure_at?: string | null;
};

type EdgeCancellationRequestResponse = EdgeCancellationRequestResponseWithAccountClosure | EdgeCancellationRequestFailure;

export type RequestSubscriptionCancellationResult = {
  ok: true;
  requestStatus: 'manual_review' | 'already_requested' | 'scheduled_account_closure';
  requestedAt: string | null;
  reason: string;
  message: string;
  subscription: {
    id: string;
    status: string;
    periodEnd: string | null;
    providerSubscriptionId?: string | null;
  };
  accountClosureAt?: string | null;
};

export class RequestSubscriptionCancellationError extends Error {
  constructor(
    public readonly code:
      | 'UNAUTHENTICATED'
      | 'BUSINESS_NOT_FOUND'
      | 'NO_ACTIVE_SUBSCRIPTION'
      | 'VALIDATION_ERROR'
      | 'RATE_LIMITED'
      | 'SERVER_CONFIG_ERROR'
      | 'NETWORK_ERROR'
      | 'UNKNOWN_ERROR',
    message: string
  ) {
    super(message);
    this.name = 'RequestSubscriptionCancellationError';
  }
}

type InvokeResult = {
  data: EdgeCancellationRequestResponse | null;
  error: { message?: string; context?: { status?: number } } | null;
};

type RequestSubscriptionCancellationDeps = {
  invokeCancelSubscription?: (payload: {
    business_id: string;
    reason: SubscriptionCancellationReason;
    mode?: 'subscription_cancellation' | 'account_cancellation';
  }) => Promise<InvokeResult>;
};

function isCancellationRequestSuccess(
  payload: EdgeCancellationRequestResponse | null
): payload is EdgeCancellationRequestResponseWithAccountClosure {
  return !!payload?.success && !!payload.request && !!payload.subscription;
}

function mapServerErrorToCancellationError(input: {
  serverErrorCode?: string;
  statusCode?: number;
  message?: string;
}): RequestSubscriptionCancellationError {
  const code = input.serverErrorCode;

  if (input.statusCode === 429 || code === 'RATE_LIMIT_EXCEEDED') {
    return new RequestSubscriptionCancellationError('RATE_LIMITED', 'Demasiados intentos. Reintentá en un minuto.');
  }

  if (input.statusCode === 401 || code === 'AUTHORIZATION_REQUIRED' || code === 'INVALID_TOKEN') {
    return new RequestSubscriptionCancellationError('UNAUTHENTICATED', 'Tu sesión expiró. Volvé a iniciar sesión.');
  }

  if (input.statusCode === 400 || code === 'BUSINESS_ID_REQUIRED' || code === 'INVALID_JSON') {
    return new RequestSubscriptionCancellationError('VALIDATION_ERROR', 'No pudimos validar la solicitud de baja.');
  }

  if (code === 'BUSINESS_NOT_FOUND') {
    return new RequestSubscriptionCancellationError('BUSINESS_NOT_FOUND', 'No encontramos el negocio asociado a tu cuenta.');
  }

  if (code === 'NO_ACTIVE_SUBSCRIPTION') {
    return new RequestSubscriptionCancellationError('NO_ACTIVE_SUBSCRIPTION', 'No encontramos una suscripción activa para procesar.');
  }

  if (input.statusCode === 404) {
    return new RequestSubscriptionCancellationError('BUSINESS_NOT_FOUND', 'No encontramos el negocio asociado a tu cuenta.');
  }

  if (input.statusCode && input.statusCode >= 500) {
    return new RequestSubscriptionCancellationError('UNKNOWN_ERROR', 'No pudimos registrar la solicitud. Contactá soporte.');
  }

  return new RequestSubscriptionCancellationError(
    'UNKNOWN_ERROR',
    input.message?.trim() || 'No pudimos registrar la solicitud. Contactá soporte.'
  );
}

async function resolveDefaultInvoker(): Promise<(payload: {
  business_id: string;
  reason: SubscriptionCancellationReason;
  mode?: 'subscription_cancellation' | 'account_cancellation';
}) => Promise<InvokeResult>> {
  if (typeof fetch !== 'function') {
    throw new RequestSubscriptionCancellationError(
      'SERVER_CONFIG_ERROR',
      'La baja manual no está disponible desde esta aplicación. Contactá soporte.'
    );
  }

  const [{ SUPABASE_CONFIG }, { createSupabaseAuthClient }] = await Promise.all([
    import('../../../../../core/auth/supabase-config'),
    import('../../../../../core/auth/supabase-auth.client')
  ]);

  const authClient = createSupabaseAuthClient({
    supabaseUrl: SUPABASE_CONFIG.url,
    supabaseAnonKey: SUPABASE_CONFIG.anonKey
  });

  return async (payload) => {
    const { data: sessionData, error: sessionError } = await authClient.getSession();
    const accessToken = sessionData.session?.access_token;

    if (sessionError || !accessToken) {
      return {
        data: null,
        error: { message: sessionError?.message ?? 'Missing session', context: { status: 401 } }
      };
    }

    const response = await fetch(new URL('/functions/v1/cancel-subscription', SUPABASE_CONFIG.url).toString(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        apikey: SUPABASE_CONFIG.anonKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data = (await response.json().catch(() => null)) as EdgeCancellationRequestResponse | null;

    return response.ok
      ? { data, error: null }
      : { data, error: { message: (data as EdgeCancellationRequestFailure | null)?.message, context: { status: response.status } } };
  };
}

export async function requestSubscriptionCancellation(
  input: RequestSubscriptionCancellationInput,
  deps: RequestSubscriptionCancellationDeps = {}
): Promise<RequestSubscriptionCancellationResult> {
  const invokeCancelSubscription = deps.invokeCancelSubscription ?? (await resolveDefaultInvoker());
  const reason = input.reason ?? 'manual_request';
  const payload: {
    business_id: string;
    reason: SubscriptionCancellationReason;
    mode?: 'subscription_cancellation' | 'account_cancellation';
  } = {
    business_id: input.businessId,
    reason
  };

  if (input.mode) {
    payload.mode = input.mode;
  }

  try {
    const { data, error } = await invokeCancelSubscription(payload);

    if (error) {
      const failurePayload = data as EdgeCancellationRequestFailure | null;
      throw mapServerErrorToCancellationError({
        serverErrorCode: failurePayload?.error,
        statusCode: error.context?.status,
        message: error.message
      });
    }

    if (!isCancellationRequestSuccess(data)) {
      const failurePayload = data as EdgeCancellationRequestFailure | null;
      throw mapServerErrorToCancellationError({
        serverErrorCode: failurePayload?.error,
        message: failurePayload?.message
      });
    }

    const result: RequestSubscriptionCancellationResult = {
      ok: true,
      requestStatus: data.request.status,
      requestedAt: data.request.requested_at,
      reason: data.request.reason,
      message: data.message,
      subscription: {
        id: data.subscription.id,
        status: data.subscription.status,
        periodEnd: data.subscription.period_end,
        ...('provider_subscription_id' in data.subscription
          ? { providerSubscriptionId: data.subscription.provider_subscription_id ?? null }
          : {})
      }
    };

    if ('account_closure_at' in data) {
      result.accountClosureAt = data.account_closure_at ?? null;
    }

    return result;
  } catch (error) {
    if (error instanceof RequestSubscriptionCancellationError) {
      throw error;
    }

    throw new RequestSubscriptionCancellationError('NETWORK_ERROR', 'Error de red al solicitar la baja. Reintentá.');
  }
}
