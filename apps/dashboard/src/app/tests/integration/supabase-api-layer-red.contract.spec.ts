import { describe, expect, it, vi } from 'vitest';

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
  setSupabaseBookingGateway: (nextGateway: SupabaseBookingGateway) => void;
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
    branchId?: string;
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
    branchId: string;
    startsAtIso: string;
    endsAtIso: string;
    reason: string;
    performedBy: string;
  }) => Promise<ApiResponse<{ blockId: string; type: 'blocked-time' }>>;
};

type SupabaseBookingGateway = Omit<SupabaseBookingApiModule, 'setSupabaseBookingGateway'>;

type SupabaseRpcError = {
  code?: string;
  message: string;
  details?: unknown;
};

type SupabaseRpcResult = {
  data: unknown;
  error: SupabaseRpcError | null;
};

type SupabaseRpcClient = {
  rpc: (fn: string, args?: Record<string, unknown>) => Promise<SupabaseRpcResult>;
};

type SupabaseGatewayFactoryModule = {
  createSupabaseBookingGateway: (deps: { client: SupabaseRpcClient }) => SupabaseBookingGateway;
};

const BUSINESS_ID = '11111111-1111-4111-8111-111111111111';
const BRANCH_ID = '22222222-2222-4222-8222-222222222222';
const SERVICE_ID = '33333333-3333-4333-8333-333333333333';
const PROFESSIONAL_ID = '44444444-4444-4444-8444-444444444444';
const CLIENT_ID = '55555555-5555-4555-8555-555555555555';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const PUBLIC_BOOKING_ID = '77777777-7777-4777-8777-777777777777';
const ADMIN_BOOKING_ID = '88888888-8888-4888-8888-888888888888';
const BLOCK_ID = '99999999-9999-4999-8999-999999999999';

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

async function loadSupabaseGatewayFactory(): Promise<SupabaseGatewayFactoryModule> {
  try {
    const mod = await import('../../core/api/supabase-booking.gateway');
    return mod as SupabaseGatewayFactoryModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/api/supabase-booking.gateway.ts exporting createSupabaseBookingGateway({ client }) for deterministic app-side RPC contract tests'
    );
  }
}

async function wireGateway(result: SupabaseRpcResult): Promise<{
  api: SupabaseBookingApiModule;
  rpcSpy: ReturnType<typeof vi.fn>;
}> {
  const api = await loadSupabaseBookingApi();
  const gatewayFactory = await loadSupabaseGatewayFactory();
  const rpcSpy = vi.fn(async () => result);

  api.setSupabaseBookingGateway(gatewayFactory.createSupabaseBookingGateway({ client: { rpc: rpcSpy } }));

  return { api, rpcSpy };
}

describe('Supabase API layer RED contract (app-side boundaries only)', () => {
  describe('public booking entry: /booking/{business_slug}', () => {
    it('resolves business by slug with public booking policy metadata', async () => {
      const { api, rpcSpy } = await wireGateway({
        data: {
          id: BUSINESS_ID,
          slug: 'studio-roma',
          name: 'Studio Roma',
          timezone: 'America/Argentina/Buenos_Aires',
          booking_policy: {
            autoConfirm: true,
            cancellationWindowMinutes: 60,
            allowClientProfessionalSelection: false
          }
        },
        error: null
      });

      const response = await api.resolveBusinessBySlug({ businessSlug: 'studio-roma' });

      expect(response).toMatchObject({
        status: 200,
        data: {
          id: BUSINESS_ID,
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
      expect(rpcSpy).toHaveBeenCalledWith('resolve_business_by_slug', { business_slug: 'studio-roma' });
    });

    it('returns deterministic BUSINESS_NOT_FOUND for unknown slug', async () => {
      const { api, rpcSpy } = await wireGateway({
        data: null,
        error: {
          code: 'PGRST116',
          message: 'Business not found for provided slug'
        }
      });

      const response = await api.resolveBusinessBySlug({ businessSlug: 'unknown-slug-qa' });

      expect(response).toEqual({
        status: 404,
        error: {
          code: 'BUSINESS_NOT_FOUND',
          message: expect.stringMatching(/slug|business/i)
        }
      });
      expect(rpcSpy).toHaveBeenCalledWith('resolve_business_by_slug', { business_slug: 'unknown-slug-qa' });
    });

    it('validates create booking payload and rejects malformed input', async () => {
      const { api, rpcSpy } = await wireGateway({ data: { booking_id: PUBLIC_BOOKING_ID }, error: null });

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
      expect(rpcSpy).not.toHaveBeenCalled();
    });

    it('rejects professional selection sent by client payload (policy)', async () => {
      const { api, rpcSpy } = await wireGateway({
        data: null,
        error: {
          code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
          message: 'Professional selection forbidden by booking policy'
        }
      });

      const response = await api.createPublicBooking({
        businessSlug: 'studio-roma',
        serviceId: SERVICE_ID,
        startsAtIso: '2026-05-10T15:00:00.000Z',
        professionalId: PROFESSIONAL_ID,
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
      expect(rpcSpy).toHaveBeenCalledWith('create_public_booking', {
        business_slug: 'studio-roma',
        service_id: SERVICE_ID,
        starts_at_iso: '2026-05-10T15:00:00.000Z',
        client: {
          fullName: 'QA Client',
          email: 'qa-client@example.com'
        },
        notes: undefined,
        professional_id: PROFESSIONAL_ID,
        branch_id: null
      });
    });

    it('auto-confirms valid booking requests under MVP policy', async () => {
      const { api, rpcSpy } = await wireGateway({ data: { booking_id: PUBLIC_BOOKING_ID }, error: null });

      const response = await api.createPublicBooking({
        businessSlug: 'studio-roma',
        serviceId: SERVICE_ID,
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
          bookingId: PUBLIC_BOOKING_ID,
          status: 'confirmed',
          source: 'client-self-service'
        }
      });
      expect(rpcSpy).toHaveBeenCalledWith('create_public_booking', {
        business_slug: 'studio-roma',
        service_id: SERVICE_ID,
        starts_at_iso: '2026-05-10T16:00:00.000Z',
        client: {
          fullName: 'QA Happy Path',
          email: 'qa-happy@example.com',
          phone: '+54 11 5555-0000'
        },
        notes: 'No preference, first visit',
        professional_id: undefined,
        branch_id: null
      });
    });
  });

  describe('manage booking entry: /booking/manage?token=...', () => {
    it('returns INVALID_TOKEN for malformed/unknown tokens', async () => {
      const { api, rpcSpy } = await wireGateway({
        data: null,
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid token'
        }
      });

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
      expect(rpcSpy).toHaveBeenCalledWith('manage_booking_by_token', {
        token: 'bad-token',
        now_iso: '2026-05-10T13:00:00.000Z'
      });
    });

    it('returns TOKEN_EXPIRED when now is after appointment start', async () => {
      const { api } = await wireGateway({
        data: null,
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Management token has expired'
        }
      });

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
      const { api } = await wireGateway({
        data: null,
        error: {
          code: 'POLICY_WINDOW_CLOSED',
          message: 'Policy window closed'
        }
      });

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
      const { api, rpcSpy } = await wireGateway({
        data: {
          bookingId: ADMIN_BOOKING_ID,
          type: 'manual-admin-appointment',
          status: 'confirmed',
          source: 'admin-manual'
        },
        error: null
      });

      const response = await api.createAdminManualBooking({
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        startsAtIso: '2026-05-10T18:00:00.000Z',
        durationMinutes: 60,
        walkInName: 'Walk-in Client QA',
        professionalId: PROFESSIONAL_ID,
        performedBy: ADMIN_ID,
        notes: 'Created from dashboard app flow'
      });

      expect(response).toEqual({
        status: 201,
        data: {
          bookingId: ADMIN_BOOKING_ID,
          type: 'manual-admin-appointment',
          status: 'confirmed',
          source: 'admin-manual'
        }
      });
      expect(rpcSpy).toHaveBeenCalledWith('create_admin_manual_booking', {
        business_id: BUSINESS_ID,
        service_id: SERVICE_ID,
        starts_at_iso: '2026-05-10T18:00:00.000Z',
        duration_minutes: 60,
        client_id: undefined,
        walk_in_name: 'Walk-in Client QA',
        professional_id: PROFESSIONAL_ID,
        performed_by: ADMIN_ID,
        notes: 'Created from dashboard app flow',
        branch_id: BRANCH_ID
      });
    });

    it('returns SLOT_CONFLICT for admin manual booking overlap', async () => {
      const { api, rpcSpy } = await wireGateway({
        data: null,
        error: {
          code: 'SLOT_CONFLICT',
          message: 'Overlap with occupied appointment'
        }
      });

      const response = await api.createAdminManualBooking({
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        serviceId: SERVICE_ID,
        startsAtIso: '2026-05-10T10:00:00.000Z',
        durationMinutes: 60,
        clientId: CLIENT_ID,
        professionalId: PROFESSIONAL_ID,
        performedBy: ADMIN_ID
      });

      expect(response).toEqual({
        status: 409,
        error: {
          code: 'SLOT_CONFLICT',
          message: expect.stringMatching(/conflict|overlap|occupied/i)
        }
      });
      expect(rpcSpy).toHaveBeenCalledWith(
        'create_admin_manual_booking',
        expect.objectContaining({
          business_id: BUSINESS_ID,
          branch_id: BRANCH_ID,
          client_id: CLIENT_ID,
          professional_id: PROFESSIONAL_ID
        })
      );
    });

    it('creates blocked-time entry with deterministic shape', async () => {
      const { api, rpcSpy } = await wireGateway({ data: { blockId: BLOCK_ID, type: 'blocked-time' }, error: null });

      const response = await api.createAdminBlockedTime({
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        startsAtIso: '2026-05-10T12:00:00.000Z',
        endsAtIso: '2026-05-10T13:00:00.000Z',
        reason: 'Staff break',
        performedBy: ADMIN_ID
      });

      expect(response).toEqual({
        status: 201,
        data: {
          blockId: BLOCK_ID,
          type: 'blocked-time'
        }
      });
      expect(rpcSpy).toHaveBeenCalledWith('create_admin_blocked_time', {
        business_id: BUSINESS_ID,
        branch_id: BRANCH_ID,
        starts_at_iso: '2026-05-10T12:00:00.000Z',
        ends_at_iso: '2026-05-10T13:00:00.000Z',
        reason: 'Staff break',
        performed_by: ADMIN_ID
      });
    });

    it('returns BLOCKED_TIME_COLLISION on overlapping blocked window', async () => {
      const { api, rpcSpy } = await wireGateway({
        data: null,
        error: {
          code: 'BLOCKED_TIME_COLLISION',
          message: 'Overlap with existing blocked window'
        }
      });

      const response = await api.createAdminBlockedTime({
        businessId: BUSINESS_ID,
        branchId: BRANCH_ID,
        startsAtIso: '2026-05-10T12:30:00.000Z',
        endsAtIso: '2026-05-10T13:30:00.000Z',
        reason: 'Overlap maintenance',
        performedBy: ADMIN_ID
      });

      expect(response).toEqual({
        status: 409,
        error: {
          code: 'BLOCKED_TIME_COLLISION',
          message: expect.stringMatching(/blocked|collision|overlap/i)
        }
      });
      expect(rpcSpy).toHaveBeenCalledWith(
        'create_admin_blocked_time',
        expect.objectContaining({
          business_id: BUSINESS_ID,
          branch_id: BRANCH_ID
        })
      );
    });
  });
});
