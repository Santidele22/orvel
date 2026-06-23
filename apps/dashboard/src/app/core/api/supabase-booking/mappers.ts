import { ApiErrorCode, ApiError, BusinessPublicView } from './types';

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

// Convert DB business record and settings to BusinessPublicView
export function mapBusinessToPublicView(
  record: { id: string; slug: string; name: string; timezone: string },
  settings?: any
): BusinessPublicView {
  // DB-FIX-111: Prioritize name and slug from settings if available, 
  // as users edit those more frequently in the dashboard
  const displayName = (settings?.business_name && settings.business_name.trim()) 
    ? settings.business_name 
    : record.name;

  return {
    id: record.id,
    slug: settings?.slug || record.slug,
    displayName: displayName,
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

// Map Supabase RPC error to ApiError
export function mapRpcErrorToApiError(error: { message?: string; code?: string }): ApiError {
  const code = error.code || '';
  const message = error.message || 'Unknown error';
  
  // Supabase plpgsql RPCs raise domain errors as P0001, so inspect the
  // message before falling back to a generic P0001 business-not-found mapping.
  if (message.includes('BUSINESS_NOT_FOUND')) {
    return { code: 'BUSINESS_NOT_FOUND', message: 'Business not found. Please check the booking link.' };
  }
  if (code === 'TOKEN_REVOKED' || message.includes('TOKEN_REVOKED')) {
    return { code: 'TOKEN_REVOKED', message };
  }
  if (code === 'BOOKING_ALREADY_CANCELLED' || message.includes('BOOKING_ALREADY_CANCELLED')) {
    return { code: 'BOOKING_ALREADY_CANCELLED', message };
  }
  if (code === 'P0002' || message.includes('BOOKING_VALIDATION_ERROR')) {
    return { code: 'VALIDATION_ERROR', message };
  }
  if (message.includes('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN')) {
    return { code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN', message };
  }
  if (message.includes('INVALID_TOKEN')) {
    return { code: 'INVALID_TOKEN', message: 'Invalid token' };
  }
  if (message.includes('TOKEN_EXPIRED')) {
    return { code: 'TOKEN_EXPIRED', message };
  }
  if (message.includes('POLICY_WINDOW_CLOSED')) {
    return { code: 'POLICY_WINDOW_CLOSED', message };
  }
  if (message.includes('SLOT_CONFLICT')) {
    return { code: 'SLOT_CONFLICT', message };
  }
  if (message.includes('BLOCKED_TIME_COLLISION')) {
    return { code: 'BLOCKED_TIME_COLLISION', message };
  }
  if (code === 'P0001') {
    return { code: 'VALIDATION_ERROR', message };
  }
  return { code: 'VALIDATION_ERROR', message };
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
