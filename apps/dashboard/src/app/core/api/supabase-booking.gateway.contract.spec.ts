import { describe, expect, it, vi } from 'vitest';
import { createSupabaseBookingGateway } from './supabase-booking.gateway';

const okRpc = (data: unknown) => Promise.resolve({ data, error: null });
const errorRpc = (code: string, message = code, details?: Record<string, unknown>) =>
  Promise.resolve({ data: null, error: { code, message, details } });

const expectedError = (status: number, code: string, message: string, details?: Record<string, unknown>) => ({
  status,
  error: { code, message, details }
});

describe('createSupabaseBookingGateway contract surface', () => {
  it('exposes every booking operation expected by runtime bootstrap', () => {
    const gateway = createSupabaseBookingGateway({
      client: {
        rpc: vi.fn(async () => ({
          data: null,
          error: null
        }))
      }
    });

    const expectedMethodNames = [
      'resolveBusinessBySlug',
      'queryPublicSlotAvailability',
      'createPublicBooking',
      'manageBookingByToken',
      'cancelBookingByToken',
      'rescheduleBookingByToken',
      'createAdminManualBooking',
      'createAdminBlockedTime',
      'updateAdminBooking',
      'cancelAdminBooking',
      'rescheduleAdminBooking',
      'updateBookingStatus'
    ] as const;

    for (const methodName of expectedMethodNames) {
      expect(typeof (gateway as Record<string, unknown>)[methodName]).toBe('function');
    }
  });

  it('maps public business resolver RPC output into the app public view contract', async () => {
    const rpc = vi.fn(() =>
      okRpc({
        id: 'biz-1',
        slug: 'demo-salon',
        name: 'Demo Salon',
        timezone: 'America/Argentina/Buenos_Aires',
        booking_policy: {
          autoConfirm: false,
          cancellationWindowMinutes: 120,
          allowClientProfessionalSelection: false
        },
        settings: {
          bufferMinutes: 15,
          minNoticeMinutes: 60,
          slotIntervalMinutes: 30,
          workingHours: { mon: [['09:00', '17:00']] }
        }
      })
    );
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(gateway.resolveBusinessBySlug({ businessSlug: 'demo-salon' })).resolves.toEqual({
      status: 200,
      data: {
        id: 'biz-1',
        slug: 'demo-salon',
        displayName: 'Demo Salon',
        timezone: 'America/Argentina/Buenos_Aires',
        bookingPolicy: {
          autoConfirm: false,
          cancellationWindowMinutes: 120,
          allowClientProfessionalSelection: false
        },
        settings: {
          bufferMinutes: 15,
          minNoticeMinutes: 60,
          slotIntervalMinutes: 30,
          workingHours: { mon: [['09:00', '17:00']] }
        }
      }
    });
    expect(rpc).toHaveBeenCalledWith('resolve_business_by_slug', { business_slug: 'demo-salon' });
  });

  it('maps missing business resolver RPC output into BUSINESS_NOT_FOUND', async () => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc('PGRST116', 'Business not found for provided slug')) }
    });

    await expect(gateway.resolveBusinessBySlug({ businessSlug: 'missing-business' })).resolves.toEqual(
      expectedError(404, 'BUSINESS_NOT_FOUND', 'Business not found for provided slug')
    );
  });

  it('maps public booking RPC success output into the app booking confirmation contract', async () => {
    const rpc = vi.fn(() => okRpc({ booking_id: 'booking-public-1' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' },
        notes: 'window seat',
        professionalId: 'pro-1'
      })
    ).resolves.toEqual({
      status: 201,
      data: { bookingId: 'booking-public-1', status: 'confirmed', source: 'client-self-service' }
    });
    expect(rpc).toHaveBeenCalledWith('create_public_booking', {
      business_slug: 'demo-salon',
      service_id: 'service-1',
      starts_at_iso: '2026-06-01T10:00:00.000Z',
      client: { fullName: 'Ada Lovelace', email: 'ada@example.test' },
      notes: 'window seat',
      professional_id: 'pro-1'
    });
  });

  it('maps public booking validation RPC errors with details and 422 status', async () => {
    const gateway = createSupabaseBookingGateway({
      client: {
        rpc: vi.fn(() => errorRpc('BOOKING_VALIDATION_ERROR', 'Validation failed', { fields: ['client.email'] }))
      }
    });

    await expect(
      gateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'bad-email' }
      })
    ).resolves.toEqual({
      status: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: { fields: ['client.email'] }
      }
    });
  });

  it('maps forbidden client professional selection to a deterministic 422 API error', async () => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc('CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN', 'Professional selection forbidden by booking policy')) }
    });

    await expect(
      gateway.createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' },
        professionalId: 'pro-1'
      })
    ).resolves.toEqual(
      expectedError(422, 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN', 'Professional selection forbidden by booking policy')
    );
  });

  it('rejects locally-invalid public booking payloads without calling Supabase RPC', async () => {
    const rpc = vi.fn(() => okRpc({ booking_id: 'booking-public-1' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.createPublicBooking({
        businessSlug: '',
        serviceId: 'service-1',
        startsAtIso: 'not-an-iso-date',
        client: { fullName: '', email: 'not-an-email' }
      })
    ).resolves.toMatchObject({
      status: 422,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps availability RPC rows to ISO slot contracts preserving RPC remaining capacity', async () => {
    const rpc = vi.fn(() =>
      okRpc([
        {
          starts_at_iso: '2026-06-01T10:00:00.000Z',
          ends_at_iso: '2026-06-01T10:30:00.000Z',
          remaining_capacity: 0
        }
      ])
    );
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.queryPublicSlotAvailability({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        dateIso: '2026-06-01'
      })
    ).resolves.toEqual({
      status: 200,
      data: {
        slots: [
          {
            startsAtIso: '2026-06-01T10:00:00.000Z',
            endsAtIso: '2026-06-01T10:30:00.000Z',
            remainingCapacity: 0
          }
        ]
      }
    });
    expect(rpc).toHaveBeenCalledWith('query_public_slot_availability', {
      business_slug: 'demo-salon',
      service_id: 'service-1',
      date_iso: '2026-06-01'
    });
  });

  it('returns policy-specific status codes for self-service token failures', async () => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc('POLICY_WINDOW_CLOSED', 'Policy window closed')) }
    });

    await expect(
      gateway.manageBookingByToken({ token: 'token-1', nowIso: '2026-06-01T09:30:00.000Z' })
    ).resolves.toEqual({
      status: 403,
      error: { code: 'POLICY_WINDOW_CLOSED', message: 'Policy window closed', details: undefined }
    });
  });

  it.each([
    ['INVALID_TOKEN', 401],
    ['TOKEN_EXPIRED', 410],
    ['TOKEN_REVOKED', 410],
    ['BOOKING_ALREADY_CANCELLED', 409],
    ['POLICY_WINDOW_CLOSED', 403]
  ] as const)('maps manage-by-token %s to deterministic status %i', async (code, status) => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc(code, code)) }
    });

    await expect(
      gateway.manageBookingByToken({ token: 'token-1', nowIso: '2026-06-01T09:30:00.000Z' })
    ).resolves.toEqual(expectedError(status, code, code));
  });

  it('maps manage-by-token RPC success output into the app management contract', async () => {
    const rpc = vi.fn(() =>
      okRpc({
        booking_id: 'booking-public-1',
        business_id: 'biz-1',
        service_id: 'service-1',
        starts_at_iso: '2026-06-01T10:00:00.000Z',
        can_cancel_or_reschedule: true
      })
    );
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.manageBookingByToken({ token: 'token-1', nowIso: '2026-06-01T09:30:00.000Z' })
    ).resolves.toEqual({
      status: 200,
      data: {
        bookingId: 'booking-public-1',
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: true
      }
    });
    expect(rpc).toHaveBeenCalledWith('manage_booking_by_token', {
      token: 'token-1',
      now_iso: '2026-06-01T09:30:00.000Z'
    });
  });

  it('rejects locally-invalid manage-by-token payloads without calling Supabase RPC', async () => {
    const rpc = vi.fn(() => okRpc({ booking_id: 'booking-public-1' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(gateway.manageBookingByToken({ token: '', nowIso: 'not-an-iso-date' })).resolves.toMatchObject({
      status: 422,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps admin manual booking RPC success output into the app admin booking contract', async () => {
    const rpc = vi.fn(() =>
      okRpc({ bookingId: 'booking-admin-1', type: 'manual-admin-appointment', status: 'confirmed', source: 'admin-manual' })
    );
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.createAdminManualBooking({
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        durationMinutes: 30,
        walkInName: 'Walk In',
        professionalId: 'pro-1',
        performedBy: 'admin-1',
        notes: 'front desk'
      })
    ).resolves.toEqual({
      status: 201,
      data: { bookingId: 'booking-admin-1', type: 'manual-admin-appointment', status: 'confirmed', source: 'admin-manual' }
    });
    expect(rpc).toHaveBeenCalledWith('create_admin_manual_booking', {
      business_id: 'biz-1',
      service_id: 'service-1',
      starts_at_iso: '2026-06-01T10:00:00.000Z',
      duration_minutes: 30,
      client_id: undefined,
      walk_in_name: 'Walk In',
      professional_id: 'pro-1',
      performed_by: 'admin-1',
      notes: 'front desk'
    });
  });

  it('maps admin manual booking slot conflicts to deterministic 409 API errors', async () => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc('SLOT_CONFLICT', 'Slot conflict detected')) }
    });

    await expect(
      gateway.createAdminManualBooking({
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        durationMinutes: 30,
        professionalId: 'pro-1',
        performedBy: 'admin-1'
      })
    ).resolves.toEqual(expectedError(409, 'SLOT_CONFLICT', 'Slot conflict detected'));
  });

  it('rejects locally-invalid admin manual booking payloads without calling Supabase RPC', async () => {
    const rpc = vi.fn(() => okRpc({ bookingId: 'booking-admin-1' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.createAdminManualBooking({
        businessId: '',
        serviceId: 'service-1',
        startsAtIso: 'not-an-iso-date',
        durationMinutes: 0,
        professionalId: '',
        performedBy: ''
      })
    ).resolves.toMatchObject({
      status: 422,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps admin blocked-time RPC success output into the app blocked-time contract', async () => {
    const rpc = vi.fn(() => okRpc({ blockId: 'block-1', type: 'blocked-time' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.createAdminBlockedTime({
        businessId: 'biz-1',
        startsAtIso: '2026-06-01T12:00:00.000Z',
        endsAtIso: '2026-06-01T13:00:00.000Z',
        reason: 'lunch',
        performedBy: 'admin-1'
      })
    ).resolves.toEqual({ status: 201, data: { blockId: 'block-1', type: 'blocked-time' } });
    expect(rpc).toHaveBeenCalledWith('create_admin_blocked_time', {
      business_id: 'biz-1',
      starts_at_iso: '2026-06-01T12:00:00.000Z',
      ends_at_iso: '2026-06-01T13:00:00.000Z',
      reason: 'lunch',
      performed_by: 'admin-1'
    });
  });

  it('maps admin blocked-time collisions to deterministic 409 API errors', async () => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc('BLOCKED_TIME_COLLISION', 'Blocked time collision')) }
    });

    await expect(
      gateway.createAdminBlockedTime({
        businessId: 'biz-1',
        startsAtIso: '2026-06-01T12:00:00.000Z',
        endsAtIso: '2026-06-01T13:00:00.000Z',
        reason: 'lunch',
        performedBy: 'admin-1'
      })
    ).resolves.toEqual(expectedError(409, 'BLOCKED_TIME_COLLISION', 'Blocked time collision'));
  });

  it('rejects locally-invalid admin blocked-time payloads without calling Supabase RPC', async () => {
    const rpc = vi.fn(() => okRpc({ blockId: 'block-1', type: 'blocked-time' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.createAdminBlockedTime({
        businessId: '',
        startsAtIso: '2026-06-01T13:00:00.000Z',
        endsAtIso: '2026-06-01T12:00:00.000Z',
        reason: '',
        performedBy: ''
      })
    ).resolves.toMatchObject({
      status: 422,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps cancel-by-token successful RPC snake_case payload to app camelCase contract', async () => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => okRpc({ booking_id: 'booking-1', status: 'cancelled' })) }
    });

    await expect(
      gateway.cancelBookingByToken({ token: 'token-1', nowIso: '2026-06-01T08:30:00.000Z' })
    ).resolves.toEqual({
      status: 200,
      data: { bookingId: 'booking-1', status: 'cancelled' }
    });
  });

  it('allows canonical completed as a valid booking status and calls the status RPC', async () => {
    const rpc = vi.fn(() => okRpc({ bookingId: 'booking-1', status: 'completed' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.updateBookingStatus({ bookingId: 'booking-1', status: 'completed', performedBy: 'admin-1' })
    ).resolves.toEqual({
      status: 200,
      data: { bookingId: 'booking-1', status: 'completed' }
    });
    expect(rpc).toHaveBeenCalledWith('update_booking_status', {
      booking_id: 'booking-1',
      status: 'completed',
      performed_by: 'admin-1'
    });
  });
});
