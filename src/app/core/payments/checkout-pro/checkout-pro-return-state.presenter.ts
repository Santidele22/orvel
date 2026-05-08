export type CheckoutReturnStatus = 'success' | 'pending' | 'failure';

export type CheckoutReturnViewModel = {
  status: CheckoutReturnStatus;
  title: string;
  message: string;
  showRetryCta: boolean;
  retryHref?: string;
};

const RETRY_HREF = '/dashboard/configuracion';

const RETURN_STATES: Record<CheckoutReturnStatus, CheckoutReturnViewModel> = {
  success: {
    status: 'success',
    title: 'Pago exitoso',
    message: 'Recibimos tu pago y estamos activando tu plan.',
    showRetryCta: false
  },
  pending: {
    status: 'pending',
    title: 'Pago pendiente',
    message: 'Estamos validando la operación. Podés reintentar si no se acredita en unos minutos.',
    showRetryCta: true,
    retryHref: RETRY_HREF
  },
  failure: {
    status: 'failure',
    title: 'Pago rechazado',
    message: 'No pudimos confirmar el pago. Revisá los datos y volvé a intentar.',
    showRetryCta: true,
    retryHref: RETRY_HREF
  }
};

const PROVIDER_ALIAS_TO_CANONICAL: Record<string, CheckoutReturnStatus> = {
  approved: 'success',
  in_process: 'pending',
  rejected: 'failure'
};

export function resolveCheckoutProReturnState(status: string): CheckoutReturnViewModel {
  if (status === 'success' || status === 'pending' || status === 'failure') {
    return RETURN_STATES[status];
  }

  const providerAliasStatus = PROVIDER_ALIAS_TO_CANONICAL[status.trim().toLowerCase()];

  if (providerAliasStatus) {
    return RETURN_STATES[providerAliasStatus];
  }

  return RETURN_STATES.failure;
}
