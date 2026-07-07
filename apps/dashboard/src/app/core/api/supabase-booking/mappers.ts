import { ApiErrorCode, ApiError, BusinessPublicView } from './types';

type RpcErrorLike = {
  message?: string;
  code?: string;
  details?: unknown;
  hint?: unknown;
  name?: string;
};

function rpcDiagnostics(error: RpcErrorLike): Record<string, unknown> | undefined {
  const details: Record<string, unknown> = {};

  if (error.details !== undefined) details['rpcDetails'] = error.details;
  if (error.hint !== undefined) details['rpcHint'] = error.hint;
  if (error.name) details['rpcName'] = error.name;
  if (Object.keys(details).length > 0 && error.code) details['rpcCode'] = error.code;

  return Object.keys(details).length > 0 ? details : undefined;
}

function apiError(code: ApiErrorCode, message: string, error: RpcErrorLike): ApiError {
  const details = rpcDiagnostics(error);

  return details ? { code, message, details } : { code, message };
}

export function isIsoDate(input: string): boolean {
  const parsed = Date.parse(input);
  return Number.isFinite(parsed);
}

export function isEmail(input: string): boolean {
  return /^\S+@\S+\.\S+$/.test(input);
}

export function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

// Convert DB business record and settings to BusinessPublicView.
// Business identity/public routing comes from businesses; settings only carries
// operational booking configuration.
export function mapBusinessToPublicView(
  record: { id: string; slug: string; name: string; timezone: string },
  settings?: any
): BusinessPublicView {
  return {
    id: record.id,
    slug: record.slug,
    displayName: record.name,
    timezone: record.timezone,
    settings: {
      bufferMinutes: settings?.buffer_minutes ?? 10,
      minNoticeMinutes: settings?.min_notice_minutes ?? 120,
      slotIntervalMinutes: settings?.slot_interval_minutes ?? 30,
      workingHours: settings?.working_hours ?? {
        monday: { enabled: true, start: '09:00', end: '18:00' },
        tuesday: { enabled: true, start: '09:00', end: '18:00' },
        wednesday: { enabled: true, start: '09:00', end: '18:00' },
        thursday: { enabled: true, start: '09:00', end: '18:00' },
        friday: { enabled: true, start: '09:00', end: '18:00' },
        saturday: { enabled: true, start: '10:00', end: '14:00' },
        sunday: { enabled: false, start: '00:00', end: '00:00' }
      }
    },
    bookingPolicy: {
      autoConfirm: settings?.auto_confirm ?? true,
      cancellationWindowMinutes: settings?.cancelation_grace_period ?? 60,
      allowClientProfessionalSelection: settings?.allow_client_professional_selection ?? false
    }
  };
}

// Map Supabase RPC error to ApiError while preserving safe diagnostics for operational logs.
export function mapRpcErrorToApiError(error: RpcErrorLike): ApiError {
  const code = error.code || '';
  const message = error.message || 'Unknown error';
  const knownDomainCodes: ApiErrorCode[] = [
    'BUSINESS_NOT_FOUND',
    'BOOKING_VALIDATION_ERROR',
    'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
    'BRANCH_NOT_FOUND',
    'BRANCH_TENANT_MISMATCH',
    'INVALID_SERVICE',
    'SERVICE_NOT_FOUND',
    'SLOT_CONFLICT',
    'BLOCKED_TIME_COLLISION'
  ];
  
  // Supabase plpgsql RPCs raise domain errors as P0001, so inspect the
  // message before falling back to a generic P0001 business-not-found mapping.
  for (const domainCode of knownDomainCodes) {
    if (code === domainCode || message.includes(domainCode)) {
      return apiError(domainCode, message, error);
    }
  }
  if (code === 'TOKEN_REVOKED' || message.includes('TOKEN_REVOKED')) {
    return apiError('TOKEN_REVOKED', message, error);
  }
  if (code === 'BOOKING_ALREADY_CANCELLED' || message.includes('BOOKING_ALREADY_CANCELLED')) {
    return apiError('BOOKING_ALREADY_CANCELLED', message, error);
  }
  if (code === 'P0002' || message.includes('BOOKING_VALIDATION_ERROR')) {
    return apiError('VALIDATION_ERROR', message, error);
  }
  if (message.includes('INVALID_TOKEN')) {
    return apiError('INVALID_TOKEN', 'Invalid token', error);
  }
  if (message.includes('TOKEN_EXPIRED')) {
    return apiError('TOKEN_EXPIRED', message, error);
  }
  if (message.includes('POLICY_WINDOW_CLOSED')) {
    return apiError('POLICY_WINDOW_CLOSED', message, error);
  }
  if (code === 'P0001') {
    return apiError('VALIDATION_ERROR', message, error);
  }
  return apiError('VALIDATION_ERROR', message, error);
}

export const KNOWN_BUSINESS: BusinessPublicView = {
  id: 'biz-default-001',
  slug: 'pending',
  displayName: 'Cargando...',
  timezone: 'America/Argentina/Buenos_Aires',
  bookingPolicy: {
    autoConfirm: true,
    cancellationWindowMinutes: 60,
    allowClientProfessionalSelection: false
  },
  settings: {
    bufferMinutes: 10,
    minNoticeMinutes: 120,
    slotIntervalMinutes: 30,
    workingHours: {
      monday: { enabled: true, start: '09:00', end: '18:00' },
      tuesday: { enabled: true, start: '09:00', end: '18:00' },
      wednesday: { enabled: true, start: '09:00', end: '18:00' },
      thursday: { enabled: true, start: '09:00', end: '18:00' },
      friday: { enabled: true, start: '09:00', end: '18:00' },
      saturday: { enabled: true, start: '10:00', end: '14:00' },
      sunday: { enabled: false, start: '00:00', end: '00:00' }
    }
  }
};
