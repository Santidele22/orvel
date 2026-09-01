import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_CLIENT } from './supabase-client.token';
import { isValidPublicBookingSlug, normalizePublicBookingSlug } from '../../public-booking-slug';
import type { SupabaseBookingGateway } from '../../gateway-interface';
import { mapBusinessToPublicView, mapRpcErrorToApiError, isIsoDate, isEmail, mapPublicBookingCreateStatus } from './mappers';
import { logMutationFailure } from '../../observability/mutation-error-log';
import type {
  ApiResponse,
  BusinessPublicView,
  PublicSlot,
  PublicBookingConfirmation,
  ManageBookingDetails,
  PublicSlotAvailabilityInput,
  PublicBookingPayload,
  ManageBookingInput,
  CancelBookingByTokenInput,
  RescheduleBookingByTokenInput,
  AdminManualBookingPayload,
  AdminBlockedTimePayload,
  AdminUpdateBookingPayload,
  AdminCancelBookingPayload,
  AdminRescheduleBookingPayload,
  AdminStatusUpdatePayload
} from '../../types';

type BookingNotificationRow = {
  id: string;
  business_id: string;
  starts_at: string;
  customer?: { full_name?: string | null; email?: string | null } | null;
  service?: { name?: string | null } | null;
  business?: { support_email?: string | null } | null;
};

type BookingNotificationContextRpcRow = {
  booking_id?: string;
  id?: string;
  business_id?: string;
  starts_at?: string;
  customer?: { full_name?: string | null; email?: string | null } | null;
  service?: { name?: string | null } | null;
  business?: { support_email?: string | null } | null;
};

async function loadBookingNotificationRow(
  supabase: SupabaseClient,
  bookingId: string,
  manageToken?: string | null
): Promise<BookingNotificationRow | null> {
  if (!bookingId || !manageToken?.trim()) return null;

  const { data, error } = await supabase.rpc('get_booking_notification_context', {
    p_booking_id: bookingId,
    p_manage_token: manageToken,
  });

  if (error || !data) return null;

  const row = data as BookingNotificationContextRpcRow;
  const id = row.id ?? row.booking_id;
  if (!id || !row.business_id || !row.starts_at) return null;

  return {
    id,
    business_id: row.business_id,
    starts_at: row.starts_at,
    customer: row.customer ?? null,
    service: row.service ?? null,
    business: row.business ?? null,
  };
}

function notificationPayload(row: BookingNotificationRow, manageToken?: string | null): Record<string, unknown> {
  const manageBaseUrl = manageToken?.trim()
    ? `/booking/manage?token=${encodeURIComponent(manageToken.trim())}`
    : null;

  return {
    booking_id: row.id,
    starts_at: row.starts_at,
    customer_name: row.customer?.full_name ?? null,
    service_name: row.service?.name ?? null,
    links: manageBaseUrl
      ? {
        view: manageBaseUrl,
        cancel: `${manageBaseUrl}&action=cancel`,
        reschedule: `${manageBaseUrl}&action=reschedule`,
      }
      : undefined,
  }
}

async function runPostBookingSideEffect(operation: string, effect: () => Promise<void>): Promise<void> {
  try {
    await effect();
  } catch (err) {
    console.warn(`[API] ${operation} side effect failed after booking RPC success:`, err);
  }
}

// Real Supabase-powered gateway implementation.
// Resolves SupabaseClient through the SUPABASE_CLIENT DI token; the adapter is
// provided at the application root via useFactory (see app.config.ts) and never
// creates its own client at module scope.
export class RealSupabaseBookingGateway implements SupabaseBookingGateway {
  private readonly supabaseClient: SupabaseClient;

  constructor(supabaseClient: SupabaseClient) {
    this.supabaseClient = supabaseClient;
  }
  async resolveBusinessBySlug({ businessSlug }: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
    try {
      const supabase = this.supabaseClient;
      const normalizedSlug = normalizePublicBookingSlug(businessSlug);

      if (!isValidPublicBookingSlug(normalizedSlug)) {
        return {
          status: 422,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid booking link.'
          }
        };
      }

      // Public booking lookup must stay behind the constrained RPC resolver.
      const { data, error } = await supabase.rpc('resolve_business_by_slug', {
        business_slug: normalizedSlug
      });

      if (error || !data) {
        console.error('[API] Business resolution failed:', error || 'No data');
        return {
          status: 404,
          error: {
            code: 'BUSINESS_NOT_FOUND',
            message: `Business not found for slug: ${businessSlug}`
          }
        };
      }

      const businessRecord = data as { id: string; slug: string; name: string; timezone: string };

      // Also fetch settings
      const { data: settingsData } = await supabase
        .from('business_settings')
        .select('*')
        .eq('business_id', businessRecord.id)
        .maybeSingle();

      return {
        status: 200,
        data: mapBusinessToPublicView(businessRecord, settingsData)
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 404,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async queryPublicSlotAvailability({ businessSlug, serviceId, dateIso, professionalId }: PublicSlotAvailabilityInput): Promise<ApiResponse<{ slots: PublicSlot[] }>> {
    if (!businessSlug?.trim() || !serviceId?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return {
        status: 422,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed for availability query payload'
        }
      };
    }

    try {
      const supabase = this.supabaseClient;

      const rpcArgs: Record<string, string> = {
        business_slug: normalizePublicBookingSlug(businessSlug),
        service_id: serviceId,
        date_iso: dateIso
      };
      if (professionalId?.trim()) {
        rpcArgs['professional_id'] = professionalId.trim();
      }

      const { data, error } = await supabase.rpc('query_public_slot_availability', rpcArgs);

      if (error) {
        const mapped = mapRpcErrorToApiError(error as { message?: string });
        logMutationFailure({
          operation: 'query_public_slot_availability',
          error,
          response: { status: 400, error: mapped }
        });
        return {
          status: 400,
          error: mapped
        };
      }

      const slots = (data as any[] || []).map(row => ({
        startsAtIso: new Date(row.starts_at_iso).toISOString(),
        endsAtIso: new Date(row.ends_at_iso).toISOString(),
        remainingCapacity: Number(row.remaining_capacity ?? row.remainingCapacity ?? 0)
      }));

      return {
        status: 200,
        data: { slots }
      };
    } catch (err) {
      const mapped = mapRpcErrorToApiError(err as { message?: string });
      logMutationFailure({
        operation: 'query_public_slot_availability',
        error: err,
        response: { status: 400, error: mapped }
      });
      return {
        status: 400,
        error: mapped
      };
    }
  }

  async createPublicBooking(payload: PublicBookingPayload): Promise<ApiResponse<PublicBookingConfirmation>> {
    const { businessSlug } = payload;

    const invalidFields: string[] = [];

    if (!payload.serviceId?.trim()) {
      invalidFields.push('serviceId');
    }

    if (!isIsoDate(payload.startsAtIso)) {
      invalidFields.push('startsAtIso');
    }

    if (!payload.client?.fullName?.trim()) {
      invalidFields.push('client.fullName');
    }

    if (!isEmail(payload.client?.email ?? '')) {
      invalidFields.push('client.email');
    }

    if (invalidFields.length > 0) {
      return {
        status: 422,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed for booking payload',
          details: { fields: invalidFields }
        }
      };
    }

    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('create_public_booking', {
        business_slug: normalizePublicBookingSlug(businessSlug),
        service_id: payload.serviceId,
        starts_at_iso: payload.startsAtIso,
        client: {
          fullName: payload.client.fullName,
          email: payload.client.email,
          phone: payload.client.phone
        },
        notes: payload.notes,
        professional_id: payload.professionalId || null,
        branch_id: null
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode = apiError.code === 'SLOT_CONFLICT' || apiError.code === 'BLOCKED_TIME_COLLISION' ? 409 :
          apiError.code === 'BOOKING_TOO_SOON' || apiError.code === 'BOOKING_TOO_FAR_ADVANCE' || apiError.code === 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN' ? 422 : 400;
        logMutationFailure({
          operation: 'create_public_booking',
          error,
          response: { status: statusCode, error: apiError }
        });
        return { status: statusCode, error: apiError };
      }

      const bookingResult = data as {
        booking_id?: string;
        branch_id?: string;
        status?: string;
        manage_token?: string;
        manageToken?: string;
        db_atomic_visibility_notifications?: boolean;
        professional_id?: string;
        professional_name?: string;
      };
      const bookingId = bookingResult.booking_id;
      const branchId = bookingResult.branch_id;
      const manageToken = bookingResult.manage_token ?? bookingResult.manageToken;

      if (!bookingId || !branchId || bookingResult.db_atomic_visibility_notifications !== true) {
        logMutationFailure({
          operation: 'create_public_booking',
          response: {
            status: 503,
            error: { code: 'DATABASE_CONTRACT_UNAVAILABLE' }
          },
          ids: { bookingId, branchId }
        });
        return {
          status: 503,
          error: {
            code: 'DATABASE_CONTRACT_UNAVAILABLE',
            message: 'Booking database contract is not available. Please try again later.'
          }
        };
      }

      const responseData: PublicBookingConfirmation = {
        bookingId,
        status: mapPublicBookingCreateStatus(bookingResult.status),
        source: 'client-self-service'
      };

      if (manageToken) {
        responseData.manageToken = manageToken;
      }

      if (bookingResult.professional_id) {
        responseData.professionalId = String(bookingResult.professional_id);
      }
      if (bookingResult.professional_name) {
        responseData.professionalName = bookingResult.professional_name;
      }

      return {
        status: 201,
        data: responseData
      };
    } catch (err) {
      const error = err as { message?: string };
      const mapped = mapRpcErrorToApiError(error);
      logMutationFailure({
        operation: 'create_public_booking',
        error: err,
        response: { status: 400, error: mapped }
      });
      return {
        status: 400,
        error: mapped
      };
    }
  }

  async manageBookingByToken({ token, nowIso }: ManageBookingInput): Promise<ApiResponse<ManageBookingDetails>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('manage_booking_by_token', {
        token,
        now_iso: nowIso
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode =
          apiError.code === 'INVALID_TOKEN'
            ? 401
            : apiError.code === 'TOKEN_EXPIRED'
              ? 410
              : apiError.code === 'POLICY_WINDOW_CLOSED'
                ? 403
                : 400;
        return { status: statusCode, error: apiError };
      }

      const row = data as any;
      const booking = row?.booking && typeof row.booking === 'object' && !Array.isArray(row.booking) ? row.booking : undefined;
      const business = row?.business && typeof row.business === 'object' && !Array.isArray(row.business) ? row.business : undefined;
      const service = row?.service && typeof row.service === 'object' && !Array.isArray(row.service) ? row.service : undefined;
      const policy = row?.policy && typeof row.policy === 'object' && !Array.isArray(row.policy) ? row.policy : undefined;
      const actions = row?.actions && typeof row.actions === 'object' && !Array.isArray(row.actions) ? row.actions : undefined;

      const responseData: {
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
      } = {
        bookingId: row?.booking_id ?? booking?.id ?? '',
        businessId: row?.business_id ?? business?.id ?? '',
        serviceId: row?.service_id ?? service?.id ?? '',
        startsAtIso: row?.starts_at_iso ?? booking?.startsAtIso ?? booking?.starts_at_iso ?? '',
        canCancelOrReschedule: Boolean(
          row?.can_cancel_or_reschedule ?? actions?.canCancel ?? actions?.can_cancel ?? actions?.canReschedule ?? actions?.can_reschedule
        )
      };

      if (typeof row?.status === 'string') responseData.status = row.status;
      if (booking) responseData.booking = booking;
      if (business) responseData.business = business;
      if (service) responseData.service = service;
      if (policy) responseData.policy = policy;
      if (actions) responseData.actions = actions;

      return {
        status: 200,
        data: responseData
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async cancelBookingByToken({ token, nowIso }: CancelBookingByTokenInput): Promise<ApiResponse<{ bookingId: string; status: "cancelled" }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('cancel_booking_by_token', {
        token,
        now_iso: nowIso
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode =
          apiError.code === 'INVALID_TOKEN'
            ? 401
            : apiError.code === 'TOKEN_EXPIRED'
              ? 410
              : apiError.code === 'POLICY_WINDOW_CLOSED'
                ? 403
                : 400;
        return { status: statusCode, error: apiError };
      }

      const bookingId = (data as { booking_id?: string })?.booking_id ?? '';

      await runPostBookingSideEffect('cancelBookingByToken notification/context', async () => {
        const booking = await loadBookingNotificationRow(supabase, bookingId, token);
        const customer = booking?.customer;

        if (booking) {
          await supabase.rpc('create_dashboard_notification_for_appointment_cancelled', {
            p_business_id: booking.business_id,
            p_appointment_id: bookingId,
            p_customer_name: customer?.full_name ?? null,
            p_service_name: booking.service?.name ?? null,
            p_starts_at: booking.starts_at,
          });
        }
      });

      return {
        status: 200,
        data: {
          bookingId,
          status: 'cancelled'
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async rescheduleBookingByToken({ token, nowIso, startsAtIso }: RescheduleBookingByTokenInput): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('reschedule_booking_by_token', {
        token,
        now_iso: nowIso,
        starts_at_iso: startsAtIso
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode =
          apiError.code === 'INVALID_TOKEN'
            ? 401
            : apiError.code === 'TOKEN_EXPIRED'
              ? 410
              : apiError.code === 'POLICY_WINDOW_CLOSED'
                ? 403
                : apiError.code === 'SLOT_CONFLICT' || apiError.code === 'BLOCKED_TIME_COLLISION'
                  ? 409
                  : 400;
        return { status: statusCode, error: apiError };
      }

      const bookingId = (data as { booking_id?: string })?.booking_id ?? '';

      await runPostBookingSideEffect('rescheduleBookingByToken notification/context', async () => {
        const booking = await loadBookingNotificationRow(supabase, bookingId, token);
        const customer = booking?.customer;

        if (booking) {
          await supabase.rpc('create_dashboard_notification_for_appointment_rescheduled', {
            p_business_id: booking.business_id,
            p_appointment_id: bookingId,
            p_customer_name: customer?.full_name ?? null,
            p_service_name: booking.service?.name ?? null,
            p_starts_at: booking.starts_at,
          });
        }
      });

      return {
        status: 200,
        data: {
          bookingId,
          startsAtIso: (data as { starts_at_iso?: string })?.starts_at_iso ?? startsAtIso
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async createAdminManualBooking(payload: AdminManualBookingPayload): Promise<ApiResponse<{ bookingId: string; type: "manual-admin-appointment"; status: "confirmed"; source: "admin-manual" }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('create_admin_manual_booking', {
        business_id: payload.businessId,
        branch_id: payload.branchId ?? null,
        service_id: payload.serviceId,
        starts_at_iso: payload.startsAtIso,
        duration_minutes: payload.durationMinutes,
        client_id: payload.clientId,
        walk_in_name: payload.walkInName,
        professional_id: payload.professionalId,
        performed_by: payload.performedBy,
        notes: payload.notes
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode = apiError.code === 'SLOT_CONFLICT' || apiError.code === 'BLOCKED_TIME_COLLISION' ? 409 :
          apiError.code === 'BOOKING_TOO_SOON' || apiError.code === 'BOOKING_TOO_FAR_ADVANCE' ? 422 : 400;
        return { status: statusCode, error: apiError };
      }

      return {
        status: 201,
        data: {
          bookingId: (data as { booking_id: string }).booking_id,
          type: 'manual-admin-appointment',
          status: 'confirmed',
          source: 'admin-manual'
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async createAdminBlockedTime(payload: AdminBlockedTimePayload): Promise<ApiResponse<{ blockId: string; type: "blocked-time" }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('create_admin_blocked_time', {
        business_id: payload.businessId,
        branch_id: payload.branchId,
        starts_at_iso: payload.startsAtIso,
        ends_at_iso: payload.endsAtIso,
        reason: payload.reason,
        performed_by: payload.performedBy
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode = apiError.code === 'BLOCKED_TIME_COLLISION' ? 409 : 400;
        return { status: statusCode, error: apiError };
      }

      return {
        status: 201,
        data: {
          blockId: (data as { blocked_time_id: string }).blocked_time_id,
          type: 'blocked-time'
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async updateAdminBooking(payload: AdminUpdateBookingPayload): Promise<ApiResponse<{ bookingId: string; updatedAt: string }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('update_admin_booking', {
        booking_id: payload.bookingId,
        performed_by: payload.performedBy,
        notes: payload.notes,
        reason: payload.reason
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        return { status: 400, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: (data as { bookingId?: string; booking_id?: string })?.bookingId ?? (data as { booking_id?: string })?.booking_id ?? payload.bookingId,
          updatedAt: (data as { updatedAt?: string; updated_at?: string })?.updatedAt ?? (data as { updated_at?: string })?.updated_at ?? new Date().toISOString()
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async cancelAdminBooking(payload: AdminCancelBookingPayload): Promise<ApiResponse<{ bookingId: string; status: "cancelled" }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('cancel_admin_booking', {
        booking_id: payload.bookingId,
        performed_by: payload.performedBy,
        notes: payload.notes,
        reason: payload.reason
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        return { status: 400, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: (data as { bookingId?: string; booking_id?: string })?.bookingId ?? (data as { booking_id?: string })?.booking_id ?? payload.bookingId,
          status: (data as { status?: 'cancelled' })?.status ?? 'cancelled'
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async rescheduleAdminBooking(payload: AdminRescheduleBookingPayload): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('reschedule_admin_booking', {
        booking_id: payload.bookingId,
        starts_at_iso: payload.startsAtIso,
        performed_by: payload.performedBy,
        notes: payload.notes,
        reason: payload.reason
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode = apiError.code === 'SLOT_CONFLICT' ? 409 : 400;
        return { status: statusCode, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: (data as { bookingId?: string; booking_id?: string })?.bookingId ?? (data as { booking_id?: string })?.booking_id ?? payload.bookingId,
          startsAtIso: (data as { startsAtIso?: string; starts_at_iso?: string })?.startsAtIso ?? (data as { starts_at_iso?: string })?.starts_at_iso ?? payload.startsAtIso
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }

  async updateBookingStatus(payload: AdminStatusUpdatePayload): Promise<ApiResponse<{ bookingId: string; status: string }>> {
    try {
      const supabase = this.supabaseClient;
      const { data, error } = await supabase.rpc('update_booking_status', {
        booking_id: payload.bookingId,
        status: payload.status,
        performed_by: payload.performedBy
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        return { status: 400, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: (data as { bookingId?: string; booking_id?: string })?.bookingId ?? (data as { booking_id?: string })?.booking_id ?? payload.bookingId,
          status: (data as { status?: string })?.status ?? payload.status
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  }
}
