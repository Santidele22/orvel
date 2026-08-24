export type ApiErrorCode =
  | 'BUSINESS_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'BOOKING_ALREADY_CANCELLED'
  | 'POLICY_WINDOW_CLOSED'
  | 'SLOT_CONFLICT'
  | 'BLOCKED_TIME_COLLISION'
  | 'BOOKING_VALIDATION_ERROR'
  | 'BOOKING_TOO_SOON'
  | 'BOOKING_TOO_FAR_ADVANCE'
  | 'BRANCH_NOT_FOUND'
  | 'BRANCH_TENANT_MISMATCH'
  | 'INVALID_SERVICE'
  | 'SERVICE_NOT_FOUND'
  | 'DATABASE_CONTRACT_UNAVAILABLE'
  | 'PUBLIC_TURNERO_DISABLED';

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

export type PublicSlot = {
  startsAtIso: string;
  endsAtIso: string;
  remainingCapacity?: number;
};

export type PublicBookingConfirmation = {
  bookingId: string;
  status: 'confirmed';
  source: 'client-self-service';
  manageToken?: string;
};

export type ManageBookingDetails = {
  bookingId: string;
  businessId: string;
  serviceId: string;
  startsAtIso: string;
  canCancelOrReschedule: boolean;
  status?: string;
  booking?: Record<string, unknown>;
  business?: Record<string, unknown>;
  service?: Record<string, unknown>;
  policy?: Record<string, unknown>;
  actions?: Record<string, unknown>;
};

export type CancelBookingByTokenInput = ManageBookingInput;

export type RescheduleBookingByTokenInput = ManageBookingInput & {
  startsAtIso: string;
};

export type AdminManualBookingPayload = {
  businessId: string;
  branchId?: string;
  serviceId: string;
  startsAtIso: string;
  durationMinutes: number;
  clientId?: string;
  walkInName?: string;
  professionalId?: string;
  performedBy: string;
  notes?: string;
};

export type AdminBlockedTimePayload = {
  businessId: string;
  branchId: string;
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
  clientId?: string | null;
  serviceId?: string | null;
  durationMinutes?: number | null;
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
