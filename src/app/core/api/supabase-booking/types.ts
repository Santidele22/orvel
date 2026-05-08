export type ApiErrorCode =
  | 'BUSINESS_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'POLICY_WINDOW_CLOSED'
  | 'SLOT_CONFLICT'
  | 'BLOCKED_TIME_COLLISION';

export type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

export type ApiResponse<T> = {
  status: number;
  data?: T;
  error?: ApiError;
};

export type BusinessPublicView = {
  id: string;
  slug: string;
  displayName: string;
  timezone: string;
  bookingPolicy: {
    autoConfirm: boolean;
    cancellationWindowMinutes: number;
    allowClientProfessionalSelection: boolean;
  };
  settings: {
    bufferMinutes: number;
    minNoticeMinutes: number;
    slotIntervalMinutes: number;
    workingHours: any;
  };
};

export type PublicBookingPayload = {
  businessSlug: string;
  serviceId: string;
  startsAtIso: string;
  client: {
    fullName: string;
    email: string;
    phone?: string;
  };
  notes?: string;
  professionalId?: string;
};

export type ManageBookingInput = {
  token: string;
  nowIso: string;
};

export type PublicSlotAvailabilityInput = {
  businessSlug: string;
  serviceId: string;
  dateIso: string;
};

export type CancelBookingByTokenInput = ManageBookingInput;

export type RescheduleBookingByTokenInput = ManageBookingInput & {
  startsAtIso: string;
};

export type AdminManualBookingPayload = {
  businessId: string;
  serviceId: string;
  startsAtIso: string;
  durationMinutes: number;
  clientId?: string;
  walkInName?: string;
  professionalId: string;
  performedBy: string;
  notes?: string;
};

export type AdminBlockedTimePayload = {
  businessId: string;
  startsAtIso: string;
  endsAtIso: string;
  reason: string;
  performedBy: string;
};

export type AdminUpdateBookingPayload = {
  bookingId: string;
  performedBy: string;
  notes?: string;
  reason?: string;
};

export type AdminCancelBookingPayload = AdminUpdateBookingPayload;

export type AdminRescheduleBookingPayload = AdminUpdateBookingPayload & {
  startsAtIso: string;
};

export type AdminStatusUpdatePayload = {
  bookingId: string;
  status: string;
  performedBy: string;
};
