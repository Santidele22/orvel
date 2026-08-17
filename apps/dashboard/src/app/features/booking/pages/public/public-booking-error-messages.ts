import type { ApiError, ApiResponse } from '@orvel/booking';

const GENERIC_BOOKING_ERROR_MESSAGE = 'No pudimos confirmar la reserva. Revisá los datos e intentá nuevamente.';

const SLOT_UNAVAILABLE_MESSAGE = 'Ese horario se acaba de ocupar o ya no está disponible. Elegí otro horario para confirmar la reserva.';

const BUSINESS_OR_SERVICE_UNAVAILABLE_MESSAGE = 'No pudimos completar la reserva para este negocio o servicio. Contactá al negocio para coordinar tu turno.';

const VALIDATION_ERROR_MESSAGE = 'Revisá los datos obligatorios y volvé a intentar.';

type BookingErrorDiagnostics = {
  status?: number;
  code?: string;
  message?: string;
  details?: Record<string, unknown>;
  raw?: unknown;
};

export function getPublicBookingSubmitErrorMessage(error?: ApiError): string {
  const code = error?.code ?? '';
  const message = error?.message ?? '';
  const searchable = `${code} ${message}`.toUpperCase();

  if (searchable.includes('SLOT_CONFLICT') || searchable.includes('BLOCKED_TIME_COLLISION')) {
    return SLOT_UNAVAILABLE_MESSAGE;
  }

  if (searchable.includes('BOOKING_TOO_SOON')) {
    return 'Este turno es muy pronto. El negocio requiere al menos 2 horas de anticipación.';
  }

  if (searchable.includes('BOOKING_TOO_FAR_ADVANCE')) {
    return 'Este turno excede el horizonte permitido por el negocio. Elegí una fecha más cercana.';
  }

  if (
    searchable.includes('BUSINESS_NOT_FOUND') ||
    searchable.includes('BRANCH_NOT_FOUND') ||
    searchable.includes('BRANCH_TENANT_MISMATCH') ||
    searchable.includes('INVALID_SERVICE') ||
    searchable.includes('SERVICE_NOT_FOUND') ||
    searchable.includes('DATABASE_CONTRACT_UNAVAILABLE')
  ) {
    return BUSINESS_OR_SERVICE_UNAVAILABLE_MESSAGE;
  }

  if (searchable.includes('VALIDATION_ERROR') || searchable.includes('BOOKING_VALIDATION_ERROR')) {
    return VALIDATION_ERROR_MESSAGE;
  }

  return GENERIC_BOOKING_ERROR_MESSAGE;
}

export function logPublicBookingSubmitFailure(input: {
  response?: ApiResponse<unknown>;
  caughtError?: unknown;
}): void {
  const diagnostics: BookingErrorDiagnostics = {
    status: input.response?.status,
    code: input.response?.error?.code,
    message: input.response?.error?.message,
    details: input.response?.error?.details,
    raw: input.caughtError ?? input.response?.error ?? input.response
  };

  console.error('[PublicBooking] Booking submit failed', diagnostics);
}
