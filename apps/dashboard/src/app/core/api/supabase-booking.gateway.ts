type ApiErrorCode =
  | 'BUSINESS_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'POLICY_WINDOW_CLOSED'
  | 'SLOT_CONFLICT'
  | 'BLOCKED_TIME_COLLISION'

type ApiError = {
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}

type ApiResponse<T> = {
  status: number
  data?: T
  error?: ApiError
}

type BusinessPublicView = {
  id: string
  slug: string
  displayName: string
  timezone: string
  bookingPolicy: {
    autoConfirm: boolean
    cancellationWindowMinutes: number
    allowClientProfessionalSelection: boolean
  }
  settings: {
    bufferMinutes: number
    minNoticeMinutes: number
    slotIntervalMinutes: number
    workingHours: any
  }
}

type PublicBookingPayload = {
  businessSlug: string
  serviceId: string
  startsAtIso: string
  client: {
    fullName: string
    email: string
    phone?: string
  }
  notes?: string
  professionalId?: string
}

type ManageBookingInput = {
  token: string
  nowIso: string
}

type PublicSlotAvailabilityInput = {
  businessSlug: string
  serviceId: string
  dateIso: string
}

type CancelBookingByTokenInput = ManageBookingInput

type RescheduleBookingByTokenInput = ManageBookingInput & {
  startsAtIso: string
}

type AdminManualBookingPayload = {
  businessId: string
  serviceId: string
  startsAtIso: string
  durationMinutes: number
  clientId?: string
  walkInName?: string
  professionalId: string
  performedBy: string
  notes?: string
}

type AdminBlockedTimePayload = {
  businessId: string
  startsAtIso: string
  endsAtIso: string
  reason: string
  performedBy: string
}

type AdminUpdateBookingPayload = {
  bookingId: string
  performedBy: string
  notes?: string
  reason?: string
}

type AdminCancelBookingPayload = AdminUpdateBookingPayload

type AdminRescheduleBookingPayload = AdminUpdateBookingPayload & {
  startsAtIso: string
}

type AdminStatusUpdatePayload = {
  bookingId: string
  status: string
  performedBy: string
}

type SupabaseRpcError = {
  code?: string
  message: string
  details?: unknown
}

type SupabaseRpcResult = {
  data: unknown
  error: SupabaseRpcError | null
}

type SupabaseRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<SupabaseRpcResult>
}

type RpcErrorMapping = {
  status: number
  code: ApiErrorCode
  fallbackMessage: string
  includeDetails?: boolean
}

const FALLBACK_MAPPING: RpcErrorMapping = {
  status: 422,
  code: 'VALIDATION_ERROR',
  fallbackMessage: 'Invalid request payload'
}

// Whitelist for bookings_status_check contract - all valid booking statuses
const ALLOWED_BOOKING_STATUSES = ['booked', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show', 'rejected']

function toObjectRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }

  return value as Record<string, unknown>
}

function mapRpcError(error: SupabaseRpcError, knownMappings: Record<string, RpcErrorMapping>): ApiError {
  const mapping = (error.code && knownMappings[error.code]) || FALLBACK_MAPPING

  return {
    code: mapping.code,
    message: error.message || mapping.fallbackMessage,
    details: mapping.includeDetails ? toObjectRecord(error.details) : undefined
  }
}

// Handoff: inject a real Supabase client with `.rpc(fn, args)` signature,
// then wire with `setSupabaseBookingGateway(createSupabaseBookingGateway({ client }))`.
export function createSupabaseBookingGateway({ client }: { client: SupabaseRpcClient }) {
  return {
    async resolveBusinessBySlug({ businessSlug }: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
      const result = await client.rpc('resolve_business_by_slug', {
        business_slug: businessSlug
      })

      if (result.error) {
        const error = mapRpcError(result.error, {
          PGRST116: {
            status: 404,
            code: 'BUSINESS_NOT_FOUND',
            fallbackMessage: 'Business not found for provided slug'
          }
        })

        return {
          status: error.code === 'BUSINESS_NOT_FOUND' ? 404 : 422,
          error
        }
      }

      const row = result.data as any;
      return {
        status: 200,
        data: {
          id: row.id,
          slug: row.slug,
          displayName: row.name,
          timezone: row.timezone,
          bookingPolicy: row.booking_policy || {
            autoConfirm: true,
            cancellationWindowMinutes: 60,
            allowClientProfessionalSelection: false
          },
          settings: row.settings || {
            bufferMinutes: 10,
            minNoticeMinutes: 120,
            slotIntervalMinutes: 30,
            workingHours: {}
          }
        } as BusinessPublicView
      }
    },

    async createPublicBooking(
      payload: PublicBookingPayload
    ): Promise<ApiResponse<{ bookingId: string; status: 'confirmed'; source: 'client-self-service' }>> {
      const result = await client.rpc('create_public_booking', {
        business_slug: payload.businessSlug,
        service_id: payload.serviceId,
        starts_at_iso: payload.startsAtIso,
        client: payload.client,
        notes: payload.notes,
        professional_id: payload.professionalId
      })

      if (result.error) {
        const knownMappings: Record<string, RpcErrorMapping> = {
          BOOKING_VALIDATION_ERROR: {
            status: 422,
            code: 'VALIDATION_ERROR',
            fallbackMessage: 'Validation failed for booking payload',
            includeDetails: true
          },
          CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN: {
            status: 422,
            code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
            fallbackMessage: 'Professional selection forbidden by booking policy'
          }
        }

        const mapped = mapRpcError(result.error, knownMappings)

        return {
          status: knownMappings[result.error.code ?? '']?.status ?? FALLBACK_MAPPING.status,
          error: mapped
        }
      }

      const row = result.data as any;
      return {
        status: 201,
        data: {
          bookingId: row.booking_id,
          status: 'confirmed',
          source: 'client-self-service'
        }
      }
    },

    async queryPublicSlotAvailability(
      input: PublicSlotAvailabilityInput
    ): Promise<ApiResponse<{ slots: Array<{ startsAtIso: string; endsAtIso: string; remainingCapacity: number }> }>> {
      const result = await client.rpc('query_public_slot_availability', {
        business_slug: input.businessSlug,
        service_id: input.serviceId,
        date_iso: input.dateIso
      })

      if (result.error) {
        const mapped = mapRpcError(result.error, {
          BOOKING_VALIDATION_ERROR: {
            status: 422,
            code: 'VALIDATION_ERROR',
            fallbackMessage: 'Validation failed for availability query payload',
            includeDetails: true
          }
        })

        return {
          status: 422,
          error: mapped
        }
      }

      const slots = ((result.data as any[]) || []).map((row) => ({
        startsAtIso: new Date(row.starts_at_iso).toISOString(),
        endsAtIso: new Date(row.ends_at_iso).toISOString(),
        remainingCapacity: Math.max(1, Number(row.remaining_capacity ?? row.remainingCapacity ?? 0))
      }));

      return {
        status: 200,
        data: { slots }
      }
    },

    async manageBookingByToken(input: ManageBookingInput): Promise<
      ApiResponse<{
        bookingId: string
        businessId: string
        serviceId: string
        startsAtIso: string
        canCancelOrReschedule: boolean
      }>
    > {
      const result = await client.rpc('manage_booking_by_token', {
        token: input.token,
        now_iso: input.nowIso
      })

      if (result.error) {
        const knownMappings: Record<string, RpcErrorMapping> = {
          INVALID_TOKEN: {
            status: 401,
            code: 'INVALID_TOKEN',
            fallbackMessage: 'Invalid token'
          },
          TOKEN_EXPIRED: {
            status: 410,
            code: 'TOKEN_EXPIRED',
            fallbackMessage: 'Management token has expired'
          },
          POLICY_WINDOW_CLOSED: {
            status: 403,
            code: 'POLICY_WINDOW_CLOSED',
            fallbackMessage: 'Policy window closed'
          }
        }

        const mapped = mapRpcError(result.error, knownMappings)

        return {
          status: knownMappings[result.error.code ?? '']?.status ?? 401,
          error: mapped
        }
      }

      const row = result.data as any;
      return {
        status: 200,
        data: {
          bookingId: row.booking_id,
          businessId: row.business_id,
          serviceId: row.service_id,
          startsAtIso: row.starts_at_iso,
          canCancelOrReschedule: row.can_cancel_or_reschedule
        }
      }
    },

    async cancelBookingByToken(input: CancelBookingByTokenInput): Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>> {
      const result = await client.rpc('cancel_booking_by_token', {
        token: input.token,
        now_iso: input.nowIso
      })

      if (result.error) {
        const mapped = mapRpcError(result.error, {
          INVALID_TOKEN: {
            status: 401,
            code: 'INVALID_TOKEN',
            fallbackMessage: 'Invalid token'
          },
          TOKEN_EXPIRED: {
            status: 410,
            code: 'TOKEN_EXPIRED',
            fallbackMessage: 'Management token has expired'
          },
          POLICY_WINDOW_CLOSED: {
            status: 403,
            code: 'POLICY_WINDOW_CLOSED',
            fallbackMessage: 'Policy window closed'
          }
        })

        return {
          status: 401,
          error: mapped
        }
      }

      return {
        status: 200,
        data: result.data as { bookingId: string; status: 'cancelled' }
      }
    },

    async rescheduleBookingByToken(
      input: RescheduleBookingByTokenInput
    ): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
      const result = await client.rpc('reschedule_booking_by_token', {
        token: input.token,
        now_iso: input.nowIso,
        starts_at_iso: input.startsAtIso
      })

      if (result.error) {
        const mapped = mapRpcError(result.error, {
          INVALID_TOKEN: {
            status: 401,
            code: 'INVALID_TOKEN',
            fallbackMessage: 'Invalid token'
          },
          TOKEN_EXPIRED: {
            status: 410,
            code: 'TOKEN_EXPIRED',
            fallbackMessage: 'Management token has expired'
          },
          POLICY_WINDOW_CLOSED: {
            status: 403,
            code: 'POLICY_WINDOW_CLOSED',
            fallbackMessage: 'Policy window closed'
          },
          SLOT_CONFLICT: {
            status: 409,
            code: 'SLOT_CONFLICT',
            fallbackMessage: 'Slot conflict detected'
          }
        })

        return {
          status: 409,
          error: mapped
        }
      }

      return {
        status: 200,
        data: result.data as { bookingId: string; startsAtIso: string }
      }
    },

    async createAdminManualBooking(payload: AdminManualBookingPayload): Promise<
      ApiResponse<{
        bookingId: string
        type: 'manual-admin-appointment'
        status: 'confirmed'
        source: 'admin-manual'
      }>
    > {
      const result = await client.rpc('create_admin_manual_booking', {
        business_id: payload.businessId,
        service_id: payload.serviceId,
        starts_at_iso: payload.startsAtIso,
        duration_minutes: payload.durationMinutes,
        client_id: payload.clientId,
        walk_in_name: payload.walkInName,
        professional_id: payload.professionalId,
        performed_by: payload.performedBy,
        notes: payload.notes
      })

      if (result.error) {
        const knownMappings: Record<string, RpcErrorMapping> = {
          SLOT_CONFLICT: {
            status: 409,
            code: 'SLOT_CONFLICT',
            fallbackMessage: 'Slot conflict detected'
          }
        }

        const mapped = mapRpcError(result.error, knownMappings)

        return {
          status: knownMappings[result.error.code ?? '']?.status ?? 409,
          error: mapped
        }
      }

      return {
        status: 201,
        data: result.data as {
          bookingId: string
          type: 'manual-admin-appointment'
          status: 'confirmed'
          source: 'admin-manual'
        }
      }
    },

    async createAdminBlockedTime(payload: AdminBlockedTimePayload): Promise<ApiResponse<{ blockId: string; type: 'blocked-time' }>> {
      const result = await client.rpc('create_admin_blocked_time', {
        business_id: payload.businessId,
        starts_at_iso: payload.startsAtIso,
        ends_at_iso: payload.endsAtIso,
        reason: payload.reason,
        performed_by: payload.performedBy
      })

      if (result.error) {
        const knownMappings: Record<string, RpcErrorMapping> = {
          BLOCKED_TIME_COLLISION: {
            status: 409,
            code: 'BLOCKED_TIME_COLLISION',
            fallbackMessage: 'Blocked time collision'
          }
        }

        const mapped = mapRpcError(result.error, knownMappings)

        return {
          status: knownMappings[result.error.code ?? '']?.status ?? 409,
          error: mapped
        }
      }

      return {
        status: 201,
        data: result.data as { blockId: string; type: 'blocked-time' }
      }
    },

    async updateAdminBooking(
      payload: AdminUpdateBookingPayload
    ): Promise<ApiResponse<{ bookingId: string; updatedAt: string }>> {
      const result = await client.rpc('update_admin_booking', {
        booking_id: payload.bookingId,
        performed_by: payload.performedBy,
        notes: payload.notes,
        reason: payload.reason
      })

      if (result.error) {
        return {
          status: 422,
          error: mapRpcError(result.error, {})
        }
      }

      return {
        status: 200,
        data: result.data as { bookingId: string; updatedAt: string }
      }
    },

    async cancelAdminBooking(
      payload: AdminCancelBookingPayload
    ): Promise<ApiResponse<{ bookingId: string; status: 'cancelled' }>> {
      const result = await client.rpc('cancel_admin_booking', {
        booking_id: payload.bookingId,
        performed_by: payload.performedBy,
        notes: payload.notes,
        reason: payload.reason
      })

      if (result.error) {
        return {
          status: 422,
          error: mapRpcError(result.error, {})
        }
      }

      return {
        status: 200,
        data: result.data as { bookingId: string; status: 'cancelled' }
      }
    },

    async rescheduleAdminBooking(
      payload: AdminRescheduleBookingPayload
    ): Promise<ApiResponse<{ bookingId: string; startsAtIso: string }>> {
      const result = await client.rpc('reschedule_admin_booking', {
        booking_id: payload.bookingId,
        starts_at_iso: payload.startsAtIso,
        performed_by: payload.performedBy,
        notes: payload.notes,
        reason: payload.reason
      })

      if (result.error) {
        return {
          status: 422,
          error: mapRpcError(result.error, {})
        }
      }

      return {
        status: 200,
        data: result.data as { bookingId: string; startsAtIso: string }
      }
    },

    async updateBookingStatus(payload: AdminStatusUpdatePayload): Promise<ApiResponse<{ bookingId: string; status: string }>> {
      // Whitelist validation: enforce valid statuses at gateway layer
      if (!ALLOWED_BOOKING_STATUSES.includes(payload.status)) {
        return {
          status: 422,
          error: { code: 'VALIDATION_ERROR', message: 'VALIDATION_ERROR: status must be one of: booked, pending, confirmed, in_progress, completed, cancelled, no_show, rejected' }
        }
      }

      const result = await client.rpc('update_booking_status', {
        booking_id: payload.bookingId,
        status: payload.status,
        performed_by: payload.performedBy
      })

      if (result.error) {
        return {
          status: 422,
          error: mapRpcError(result.error, {})
        }
      }

      return {
        status: 200,
        data: result.data as { bookingId: string; status: string }
      }
    }
  }
}
