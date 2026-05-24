import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { loadDashboardRuntimeEnv } from '../../runtime/dashboard-env';
import { computePublicAvailability, type CalendarEntry } from '../../../domain/appointments/booking-core';
import { SupabaseBookingGateway } from './gateway-interface';
import { mapBusinessToPublicView, mapRpcErrorToApiError, isIsoDate, isEmail, buildDeterministicPublicSlots } from './mappers';

// Initialize real Supabase client
export function createSupabaseClient(): SupabaseClient {
  const env = loadDashboardRuntimeEnv();
  const urlEnvKey = 'NEXT_PUBLIC_SUPABASE_URL';
  const anonKeyEnvKey = 'NEXT_PUBLIC_SUPABASE_ANON_KEY';
  console.log(env[urlEnvKey], env[anonKeyEnvKey]);
  return createClient(env[urlEnvKey], env[anonKeyEnvKey]);
}

type BookingNotificationRow = {
  id: string;
  business_id: string;
  starts_at: string;
  customer?: { full_name?: string | null; email?: string | null } | null;
  service?: { name?: string | null } | null;
};

async function loadBookingNotificationRow(supabase: SupabaseClient, bookingId: string): Promise<BookingNotificationRow | null> {
  if (!bookingId) return null;

  const { data } = await supabase
    .from('bookings')
    .select('id, business_id, starts_at, customer:customers(full_name, email), service:services(name)')
    .eq('id', bookingId)
    .maybeSingle();

  return (data as BookingNotificationRow | null) ?? null;
}

function notificationPayload(row: BookingNotificationRow): Record<string, unknown> {
  return {
    booking_id: row.id,
    starts_at: row.starts_at,
    customer_name: row.customer?.full_name ?? null,
    service_name: row.service?.name ?? null,
  };
}

// Real Supabase-powered gateway implementation
export const realSupabaseGateway: SupabaseBookingGateway = {
  async resolveBusinessBySlug({ businessSlug }) {
    try {
      const supabase = createSupabaseClient();
      const normalizedSlug = businessSlug.toLowerCase().trim();

      // First, try a direct query to the businesses table
      const { data: businessData, error: businessError } = await supabase
        .from('businesses')
        .select('*')
        .ilike('slug', normalizedSlug)
        .maybeSingle();

      if (!businessError && businessData) {
        // Also fetch settings
        const { data: settingsData } = await supabase
          .from('business_settings')
          .select('*')
          .eq('business_id', businessData.id)
          .maybeSingle();
        return {
          status: 200,
          data: mapBusinessToPublicView(businessData, settingsData)
        };
      }

      // If direct query fails, try the RPC
      const { data, error } = await supabase.rpc('resolve_business_by_slug', {
        business_slug: normalizedSlug
      });

      if (error || !data) {
        // Try with hyphens removed: "studio-roma" → "studioroma" and vice versa
        const slugVariants = new Set([
          normalizedSlug,
          normalizedSlug.replace(/-/g, ''),           // Remove hyphens
          normalizedSlug.replace(/([a-z])([A-Z])/g, '$1-$2'), // camelCase → kebab-case
        ]);
        
        for (const variant of slugVariants) {
          if (!variant || variant === normalizedSlug) continue;
          try {
            const retry = await supabase.rpc('resolve_business_by_slug', { business_slug: variant });
            if (!retry.error && retry.data) {
              const retryBiz = retry.data as { id: string; slug: string; name: string; timezone: string };
              // Also fetch settings for the variant
              const { data: retrySettings } = await supabase
                .from('business_settings')
                .select('*')
                .eq('business_id', retryBiz.id)
                .maybeSingle();
              
              return { status: 200, data: mapBusinessToPublicView(retryBiz, retrySettings) };
            }
          } catch (e) {
            console.warn('[API] RPC variant retry failed:', variant, e);
          }
        }

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
  },

  async queryPublicSlotAvailability({ businessSlug, serviceId, dateIso }) {
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
      const supabase = createSupabaseClient();

      // Call the improved PostgreSQL RPC
      const { data, error } = await supabase.rpc('query_public_slot_availability', {
        business_slug: businessSlug,
        service_id: serviceId,
        date_iso: dateIso
      });

      if (error) {
        return {
          status: 400,
          error: mapRpcErrorToApiError(error as { message?: string })
        };
      }

      const slots = (data as any[] || []).map(row => ({
        startsAtIso: new Date(row.starts_at_iso).toISOString(),
        endsAtIso: new Date(row.ends_at_iso).toISOString()
      }));

      return {
        status: 200,
        data: { slots }
      };
    } catch (err) {
      console.error('[API] queryPublicSlotAvailability catch error:', err);
      return {
        status: 200,
        data: { slots: buildDeterministicPublicSlots(dateIso) }
      };
    }
  },

  async createPublicBooking(payload) {
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

    if (payload.professionalId) {
      return {
        status: 422,
        error: {
          code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
          message: 'Client professional selection is forbidden by booking policy'
        }
      };
    }

    // Call real Supabase RPC to create booking
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.rpc('create_public_booking', {
        business_slug: payload.businessSlug,
        service_id: payload.serviceId,
        starts_at_iso: payload.startsAtIso,
        client: {
          fullName: payload.client.fullName,
          email: payload.client.email,
          phone: payload.client.phone
        },
        notes: payload.notes
      });

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode = apiError.code === 'SLOT_CONFLICT' || apiError.code === 'BLOCKED_TIME_COLLISION' ? 409 : 400;
        return { status: statusCode, error: apiError };
      }

      const bookingId = (data as { booking_id: string }).booking_id;
      const booking = await loadBookingNotificationRow(supabase, bookingId);

      if (booking) {
        if (payload.client.email) {
          await supabase.from('notification_email_outbox').insert({
            business_id: booking.business_id,
            booking_id: bookingId,
            to_email: payload.client.email,
            template_key: 'appointment_confirmation',
            payload: notificationPayload(booking),
          });
        }

        const { data: bizData } = await supabase
          .from('business_settings')
          .select('support_email, business_id')
          .eq('business_id', booking.business_id)
          .maybeSingle();

        let businessEmail = bizData?.support_email;
        if (!businessEmail) {
           const { data: b } = await supabase.from('businesses').select('owner_id').eq('id', booking.business_id).maybeSingle();
           if (b?.owner_id) {
              const { data: u } = await supabase.from('users').select('email').eq('id', b.owner_id).maybeSingle();
              if (u) businessEmail = u.email;
           }
        }

        if (businessEmail) {
          await supabase.from('notification_email_outbox').insert({
            business_id: booking.business_id,
            booking_id: bookingId,
            to_email: businessEmail,
            template_key: 'appointment_created_business',
            payload: notificationPayload(booking),
          });
        }

        await supabase.rpc('create_dashboard_notification_for_appointment_created', {
          p_business_id: booking.business_id,
          p_appointment_id: bookingId,
          p_customer_name: payload.client.fullName,
          p_service_name: booking.service?.name ?? null,
          p_starts_at: booking.starts_at,
        });
      }

      return {
        status: 201,
        data: {
          bookingId,
          status: 'confirmed',
          source: 'client-self-service'
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  },

  async manageBookingByToken({ token, nowIso }) {
    try {
      const supabase = createSupabaseClient();
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

      // Get booking details
      const { data: bookingData } = await supabase
        .from('bookings')
        .select('id, business_id, service_id, starts_at')
        .eq('manage_token', token)
        .maybeSingle();

      return {
        status: 200,
        data: {
          bookingId: (bookingData as { id: string })?.id || '',
          businessId: (bookingData as { business_id: string })?.business_id || '',
          serviceId: (bookingData as { service_id: string })?.service_id || '',
          startsAtIso: (bookingData as { starts_at: string })?.starts_at || '',
          canCancelOrReschedule: true
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  },

  async cancelBookingByToken({ token, nowIso }) {
    try {
      const supabase = createSupabaseClient();
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
      const booking = await loadBookingNotificationRow(supabase, bookingId);
      const customer = booking?.customer;

      if (booking) {
        if (customer?.email) {
          await supabase.from('notification_email_outbox').insert({
            business_id: booking.business_id,
            booking_id: bookingId,
            to_email: customer.email,
            template_key: 'booking_cancelled',
            payload: notificationPayload(booking),
          });
        }

        await supabase.rpc('create_dashboard_notification_for_appointment_cancelled', {
          p_business_id: booking.business_id,
          p_appointment_id: bookingId,
          p_customer_name: customer?.full_name ?? null,
          p_service_name: booking.service?.name ?? null,
          p_starts_at: booking.starts_at,
        });
      }

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
  },

  async rescheduleBookingByToken({ token, nowIso, startsAtIso }) {
    try {
      const supabase = createSupabaseClient();
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
      const booking = await loadBookingNotificationRow(supabase, bookingId);
      const customer = booking?.customer;

      if (booking) {
        if (customer?.email) {
          await supabase.from('notification_email_outbox').insert({
            business_id: booking.business_id,
            booking_id: bookingId,
            to_email: customer.email,
            template_key: 'booking_rescheduled',
            payload: notificationPayload(booking),
          });
        }

        await supabase.rpc('create_dashboard_notification_for_appointment_rescheduled', {
          p_business_id: booking.business_id,
          p_appointment_id: bookingId,
          p_customer_name: customer?.full_name ?? null,
          p_service_name: booking.service?.name ?? null,
          p_starts_at: booking.starts_at,
        });
      }

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
  },

  async createAdminManualBooking(payload) {
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.rpc('create_admin_manual_booking', {
        business_id: payload.businessId,
        branch_id: payload.branchId,
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
        const statusCode = apiError.code === 'SLOT_CONFLICT' || apiError.code === 'BLOCKED_TIME_COLLISION' ? 409 : 400;
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
  },

  async createAdminBlockedTime(payload) {
    try {
      const supabase = createSupabaseClient();
      const { data, error } = await supabase.rpc('create_admin_blocked_time', {
        business_id: payload.businessId,
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
  },

  async updateAdminBooking(payload) {
    try {
      const supabase = createSupabaseClient();
      const requestedBusinessId = (payload as { businessId?: string }).businessId;

      // First check if booking exists
      const fetchQuery = supabase
        .from('bookings')
        .select('id, notes, business_id')
        .eq('id', payload.bookingId);

      if (requestedBusinessId) {
        fetchQuery.eq('business_id', requestedBusinessId);
      }

      const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();

      if (fetchError || !existing) {
        return {
          status: 404,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_NOT_FOUND: Booking not found' }
        };
      }

      // Update booking with notes
      const updatedNotes = payload.notes ? payload.notes : undefined;

      const { data: updated, error } = await supabase
        .from('bookings')
        .update({
          notes: updatedNotes,
          updated_at: new Date().toISOString()
        })
        .eq('id', payload.bookingId)
        .eq('business_id', (existing as { business_id: string }).business_id)
        .select('id, updated_at')
        .single();

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        return { status: 400, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: payload.bookingId,
          updatedAt: (updated as { updated_at: string })?.updated_at || new Date().toISOString()
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  },

  async cancelAdminBooking(payload) {
    try {
      const supabase = createSupabaseClient();
      const requestedBusinessId = (payload as { businessId?: string }).businessId;

      // First check if booking exists and its current status
      const fetchQuery = supabase
        .from('bookings')
        .select('id, status, business_id')
        .eq('id', payload.bookingId);

      if (requestedBusinessId) {
        fetchQuery.eq('business_id', requestedBusinessId);
      }

      const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();

      if (fetchError || !existing) {
        return {
          status: 404,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_NOT_FOUND: Booking not found' }
        };
      }

      const currentStatus = (existing as { status: string }).status;
      if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'no_show') {
        return {
          status: 400,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_INVALID_STATUS_TRANSITION: Cannot cancel booking in current status' }
        };
      }

      // Append audit info to notes
      const auditEntry = `[admin:cancel] by=${payload.performedBy} at=${new Date().toISOString()}${payload.reason ? ' | reason=' + payload.reason : ''}`;

      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          notes: payload.notes ? `${payload.notes}\n${auditEntry}` : auditEntry,
          updated_at: new Date().toISOString()
        })
        .eq('id', payload.bookingId)
        .eq('business_id', (existing as { business_id: string }).business_id);

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        return { status: 400, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: payload.bookingId,
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
  },

  async rescheduleAdminBooking(payload) {
    try {
      const supabase = createSupabaseClient();
      const requestedBusinessId = (payload as { businessId?: string }).businessId;

      // First check if booking exists
      const fetchQuery = supabase
        .from('bookings')
        .select('id, status, starts_at, ends_at, business_id')
        .eq('id', payload.bookingId);

      if (requestedBusinessId) {
        fetchQuery.eq('business_id', requestedBusinessId);
      }

      const { data: existing, error: fetchError } = await fetchQuery.maybeSingle();

      if (fetchError || !existing) {
        return {
          status: 404,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_NOT_FOUND: Booking not found' }
        };
      }

      const currentStatus = (existing as { status: string }).status;
      if (currentStatus === 'cancelled' || currentStatus === 'completed' || currentStatus === 'no_show') {
        return {
          status: 400,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_INVALID_STATUS_TRANSITION: Cannot reschedule booking in current status' }
        };
      }

      // Append audit info to notes
      const newStartsAt = payload.startsAtIso;
      const auditEntry = `[admin:reschedule] by=${payload.performedBy || 'admin'} at=${new Date().toISOString()}${payload.notes ? ' | reason=' + payload.notes : ''}`;

      const { error } = await supabase
        .from('bookings')
        .update({
          starts_at: newStartsAt,
          notes: payload.notes ? `${payload.notes}\n${auditEntry}` : auditEntry,
          updated_at: new Date().toISOString()
        })
        .eq('id', payload.bookingId)
        .eq('business_id', (existing as { business_id: string }).business_id);

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        const statusCode = apiError.code === 'SLOT_CONFLICT' ? 409 : 400;
        return { status: statusCode, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: payload.bookingId,
          startsAtIso: newStartsAt
        }
      };
    } catch (err) {
      const error = err as { message?: string };
      return {
        status: 400,
        error: mapRpcErrorToApiError(error)
      };
    }
  },

  async updateBookingStatus(payload) {
    try {
      const supabase = createSupabaseClient();
      const requestedBusinessId = (payload as { businessId?: string }).businessId;

      if (requestedBusinessId) {
        const { data: scopedBooking } = await supabase
          .from('bookings')
          .select('id')
          .eq('id', payload.bookingId)
          .eq('business_id', requestedBusinessId)
          .maybeSingle();

        if (!scopedBooking) {
          return {
            status: 404,
            error: { code: 'VALIDATION_ERROR', message: 'TURNO_NOT_FOUND: Booking not found' }
          };
        }
      }

      // Validate status - whitelist all valid booking statuses
      const validStatuses = ['booked', 'pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected'];
      if (!validStatuses.includes(payload.status)) {
        return {
          status: 400,
          error: { code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR: status must be one of: booked, pending, confirmed, in_progress, completed, cancelled, no_show, rejected' }
        };
      }

      // First check if booking exists
      const { data: existing, error: fetchError } = await supabase
        .from('bookings')
        .select('id, status, business_id')
        .eq('id', payload.bookingId)
        .maybeSingle();

      if (fetchError || !existing) {
        return {
          status: 404,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_NOT_FOUND: Booking not found' }
        };
      }

      const currentStatus = (existing as { status: string }).status;

      // Validate status transitions
      const allowedTransitions: Record<string, string[]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['in_progress', 'cancelled', 'no_show'],
        in_progress: ['completed', 'cancelled']
      };

      const allowed = allowedTransitions[currentStatus] || [];
      if (!allowed.includes(payload.status)) {
        return {
          status: 400,
          error: { code: 'VALIDATION_ERROR', message: 'TURNO_INVALID_STATUS_TRANSITION: Cannot transition from ' + currentStatus + ' to ' + payload.status }
        };
      }

      // Append audit to notes
      const auditEntry = `[admin:status_${payload.status}] by=${payload.performedBy} at=${new Date().toISOString()}`;

      const { error } = await supabase
        .from('bookings')
        .update({
          status: payload.status,
          notes: auditEntry,
          updated_at: new Date().toISOString()
        })
        .eq('id', payload.bookingId)
        .eq('business_id', (existing as { business_id: string }).business_id);

      if (error) {
        const apiError = mapRpcErrorToApiError(error as { message?: string });
        return { status: 400, error: apiError };
      }

      return {
        status: 200,
        data: {
          bookingId: payload.bookingId,
          status: payload.status
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
};
