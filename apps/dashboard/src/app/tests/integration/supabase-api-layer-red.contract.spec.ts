import { describe, expect, it } from 'vitest';

type ApiErrorCode =
  | 'BUSINESS_NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'POLICY_WINDOW_CLOSED'
  | 'SLOT_CONFLICT'
  | 'BLOCKED_TIME_COLLISION';

type ApiError = {
  code: ApiErrorCode;
  message: string;
  details?: Record<string, unknown>;
};

type ApiResponse<T> = {
  status: number;
  data?: T;
  error?: ApiError;
};

type BusinessPublicView = {
  id: string;
  slug: string;
  displayName: string;
  timezone: string;
  bookingPolicy: {
    autoConfirm: true;
    cancellationWindowMinutes: 60;
    allowClientProfessionalSelection: false;
  };
};

type PublicBookingPayload = {
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

type SupabaseBookingApiModule = {
  resolveBusinessBySlug: (input: { businessSlug: string }) => Promise<ApiResponse<BusinessPublicView>>;
  createPublicBooking: (
    payload: PublicBookingPayload
  ) => Promise<ApiResponse<{ bookingId: string; status: 'confirmed'; source: 'client-self-service' }>>;
  manageBookingByToken: (input: {
    token: string;
    nowIso: string;
  }) => Promise<
    ApiResponse<{
      bookingId: string;
      businessId: string;
      serviceId: string;
      startsAtIso: string;
      canCancelOrReschedule: boolean;
    }>
  >;
  createAdminManualBooking: (payload: {
    businessId: string;
    serviceId: string;
    startsAtIso: string;
    durationMinutes: number;
    clientId?: string;
    walkInName?: string;
    professionalId: string;
    performedBy: string;
    notes?: string;
  }) => Promise<
    ApiResponse<{
      bookingId: string;
      type: 'manual-admin-appointment';
      status: 'confirmed';
      source: 'admin-manual';
    }>
  >;
  createAdminBlockedTime: (payload: {
    businessId: string;
    startsAtIso: string;
    endsAtIso: string;
    reason: string;
    performedBy: string;
  }) => Promise<ApiResponse<{ blockId: string; type: 'blocked-time' }>>;
};

async function loadSupabaseBookingApi(): Promise<SupabaseBookingApiModule> {
  try {
    const mod = await import('../../core/api/supabase-booking.api');
    return mod as SupabaseBookingApiModule;
  } catch {
    throw new Error(
      'TODO(Magnus): missing src/app/core/api/supabase-booking.api.ts implementing resolveBusinessBySlug(), createPublicBooking(), manageBookingByToken(), createAdminManualBooking(), createAdminBlockedTime()'
    );
  }
}

describe('Supabase API layer RED contract (app-side boundaries only)', () => {
  describe('public booking entry: /booking/{business_slug}', () => {
    it('resolves business by slug with public booking policy metadata', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.resolveBusinessBySlug({ businessSlug: 'studio-roma' });

      expect(response).toEqual({
        status: 200,
        data: {
          id: expect.any(String),
          slug: 'studio-roma',
          displayName: expect.any(String),
          timezone: expect.any(String),
          bookingPolicy: {
            autoConfirm: true,
            cancellationWindowMinutes: 60,
            allowClientProfessionalSelection: false
          }
        }
      });
    });

    it('returns deterministic BUSINESS_NOT_FOUND for unknown slug', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.resolveBusinessBySlug({ businessSlug: 'unknown-slug-qa' });

      expect(response).toEqual({
        status: 404,
        error: {
          code: 'BUSINESS_NOT_FOUND',
          message: expect.stringMatching(/slug|business/i)
        }
      });
    });

    it('validates create booking payload and rejects malformed input', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createPublicBooking({
        businessSlug: 'studio-roma',
        serviceId: '',
        startsAtIso: 'invalid-date',
        client: {
          fullName: '',
          email: 'not-an-email'
        }
      });

      expect(response).toEqual({
        status: 422,
        error: {
          code: 'VALIDATION_ERROR',
          message: expect.stringMatching(/validation|invalid/i),
          details: expect.objectContaining({
            fields: expect.arrayContaining(['serviceId', 'startsAtIso', 'client.fullName', 'client.email'])
          })
        }
      });
    });

    it('rejects professional selection sent by client payload (policy)', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createPublicBooking({
        businessSlug: 'studio-roma',
        serviceId: 'svc-cut-001',
        startsAtIso: '2026-05-10T15:00:00.000Z',
        professionalId: 'pro-123',
        client: {
          fullName: 'QA Client',
          email: 'qa-client@example.com'
        }
      });

      expect(response).toEqual({
        status: 422,
        error: {
          code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
          message: expect.stringMatching(/professional|selection|forbidden/i)
        }
      });
    });

    it('auto-confirms valid booking requests under MVP policy', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createPublicBooking({
        businessSlug: 'studio-roma',
        serviceId: 'svc-cut-001',
        startsAtIso: '2026-05-10T16:00:00.000Z',
        client: {
          fullName: 'QA Happy Path',
          email: 'qa-happy@example.com',
          phone: '+54 11 5555-0000'
        },
        notes: 'No preference, first visit'
      });

      expect(response).toEqual({
        status: 201,
        data: {
          bookingId: expect.any(String),
          status: 'confirmed',
          source: 'client-self-service'
        }
      });
    });
  });

  describe('manage booking entry: /booking/manage?token=...', () => {
    it('returns INVALID_TOKEN for malformed/unknown tokens', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.manageBookingByToken({
        token: 'bad-token',
        nowIso: '2026-05-10T13:00:00.000Z'
      });

      expect(response).toEqual({
        status: 401,
        error: {
          code: 'INVALID_TOKEN',
          message: expect.stringMatching(/invalid token/i)
        }
      });
    });

    it('returns TOKEN_EXPIRED when now is after appointment start', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.manageBookingByToken({
        token: 'tok_valid_appt-qa-001',
        nowIso: '2026-05-10T16:05:00.000Z'
      });

      expect(response).toEqual({
        status: 410,
        error: {
          code: 'TOKEN_EXPIRED',
          message: expect.stringMatching(/expired/i)
        }
      });
    });

    it('returns POLICY_WINDOW_CLOSED when cancel/reschedule window (<1h) is closed', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.manageBookingByToken({
        token: 'tok_valid_appt-qa-001',
        nowIso: '2026-05-10T15:20:00.000Z'
      });

      expect(response).toEqual({
        status: 403,
        error: {
          code: 'POLICY_WINDOW_CLOSED',
          message: expect.stringMatching(/window|policy|closed/i)
        }
      });
    });
  });

  describe('dashboard app-side admin contracts (manual booking + blocked time)', () => {
    it('creates manual admin booking with deterministic source/type/status shape', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createAdminManualBooking({
        businessId: 'biz-qa-001',
        serviceId: 'svc-color-001',
        startsAtIso: '2026-05-10T18:00:00.000Z',
        durationMinutes: 60,
        walkInName: 'Walk-in Client QA',
        professionalId: 'pro-001',
        performedBy: 'admin-qa',
        notes: 'Created from dashboard app flow'
      });

      expect(response).toEqual({
        status: 201,
        data: {
          bookingId: expect.any(String),
          type: 'manual-admin-appointment',
          status: 'confirmed',
          source: 'admin-manual'
        }
      });
    });

    it('returns SLOT_CONFLICT for admin manual booking overlap', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createAdminManualBooking({
        businessId: 'biz-qa-001',
        serviceId: 'svc-color-001',
        startsAtIso: '2026-05-10T10:00:00.000Z',
        durationMinutes: 60,
        clientId: 'client-occupied-slot',
        professionalId: 'pro-001',
        performedBy: 'admin-qa'
      });

      expect(response).toEqual({
        status: 409,
        error: {
          code: 'SLOT_CONFLICT',
          message: expect.stringMatching(/conflict|overlap|occupied/i)
        }
      });
    });

    it('creates blocked-time entry with deterministic shape', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createAdminBlockedTime({
        businessId: 'biz-qa-001',
        startsAtIso: '2026-05-10T12:00:00.000Z',
        endsAtIso: '2026-05-10T13:00:00.000Z',
        reason: 'Staff break',
        performedBy: 'admin-qa'
      });

      expect(response).toEqual({
        status: 201,
        data: {
          blockId: expect.any(String),
          type: 'blocked-time'
        }
      });
    });

    it('returns BLOCKED_TIME_COLLISION on overlapping blocked window', async () => {
      const api = await loadSupabaseBookingApi();

      const response = await api.createAdminBlockedTime({
        businessId: 'biz-qa-001',
        startsAtIso: '2026-05-10T12:30:00.000Z',
        endsAtIso: '2026-05-10T13:30:00.000Z',
        reason: 'Overlap maintenance',
        performedBy: 'admin-qa'
      });

      expect(response).toEqual({
        status: 409,
        error: {
          code: 'BLOCKED_TIME_COLLISION',
          message: expect.stringMatching(/blocked|collision|overlap/i)
        }
      });
    });
  });
});
