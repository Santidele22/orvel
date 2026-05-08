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

type SupabaseBookingGateway = {
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

type SupabaseApiModule = {
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

async function loadSupabaseGatewayFactory(): Promise<SupabaseGatewayFactoryModule> {
  try {
    const mod = await import('../../core/api/supabase-booking.gateway');
    return mod as SupabaseGatewayFactoryModule;
  } catch {
    throw new Error(
      'TODO(Magnus): add src/app/core/api/supabase-booking.gateway.ts exporting createSupabaseBookingGateway({ client }) for Supabase/RPC -> adapter contract mapping'
    );
  }
}

function buildRpcClient(result: SupabaseRpcResult): { client: SupabaseRpcClient; rpcSpy: ReturnType<typeof vi.fn> } {
  const rpcSpy = vi.fn(async () => result);

  return {
    client: {
      rpc: rpcSpy
    },
    rpcSpy
  };
}

async function wireGateway(client: SupabaseRpcClient): Promise<SupabaseApiModule> {
  const api = (await import('../../core/api/supabase-booking.api')) as SupabaseApiModule;
  const gatewayFactory = await loadSupabaseGatewayFactory();

  api.setSupabaseBookingGateway(gatewayFactory.createSupabaseBookingGateway({ client }));
  return api;
}

describe('Supabase gateway RED mapping contracts (RPC outcomes => deterministic adapter responses)', () => {
  it('maps business slug RPC not found into BUSINESS_NOT_FOUND (404)', async () => {
    const { client, rpcSpy } = buildRpcClient({
      data: null,
      error: {
        code: 'PGRST116',
        message: 'No rows found for business slug'
      }
    });

    const api = await wireGateway(client);
    const response = await api.resolveBusinessBySlug({ businessSlug: 'unknown-slug-qa' });

    expect(response).toEqual({
      status: 404,
      error: {
        code: 'BUSINESS_NOT_FOUND',
        message: expect.stringMatching(/slug|business|not found/i)
      }
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('resolve_business_by_slug', expect.any(Object));
  });

  it('maps booking create RPC validation error into VALIDATION_ERROR (422)', async () => {
    const { client, rpcSpy } = buildRpcClient({
      data: null,
      error: {
        code: 'BOOKING_VALIDATION_ERROR',
        message: 'Invalid booking payload',
        details: {
          fields: ['serviceId', 'startsAtIso', 'client.email']
        }
      }
    });

    const api = await wireGateway(client);
    const response = await api.createPublicBooking({
      businessSlug: 'studio-roma',
      serviceId: '',
      startsAtIso: 'invalid-date',
      client: {
        fullName: 'QA',
        email: 'invalid-email'
      }
    });

    expect(response).toEqual({
      status: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.stringMatching(/validation|invalid/i),
        details: {
          fields: ['serviceId', 'startsAtIso', 'client.email']
        }
      }
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('create_public_booking', expect.any(Object));
  });

  it('maps booking create RPC policy error into CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN (422)', async () => {
    const { client, rpcSpy } = buildRpcClient({
      data: null,
      error: {
        code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
        message: 'Professional selection forbidden by business policy'
      }
    });

    const api = await wireGateway(client);
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
        message: expect.stringMatching(/professional|selection|forbidden|policy/i)
      }
    });

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('create_public_booking', expect.any(Object));
  });

  it('maps token invalid/expired/policy window RPC outcomes to existing adapter contract statuses', async () => {
    const invalidClient = buildRpcClient({
      data: null,
      error: {
        code: 'INVALID_TOKEN',
        message: 'Token does not exist'
      }
    });

    const invalidApi = await wireGateway(invalidClient.client);
    const invalidResponse = await invalidApi.manageBookingByToken({
      token: 'bad-token',
      nowIso: '2026-05-10T13:00:00.000Z'
    });

    expect(invalidResponse).toEqual({
      status: 401,
      error: {
        code: 'INVALID_TOKEN',
        message: expect.stringMatching(/invalid token|token/i)
      }
    });

    const expiredClient = buildRpcClient({
      data: null,
      error: {
        code: 'TOKEN_EXPIRED',
        message: 'Management token has expired'
      }
    });

    const expiredApi = await wireGateway(expiredClient.client);
    const expiredResponse = await expiredApi.manageBookingByToken({
      token: 'tok_valid_appt-qa-001',
      nowIso: '2026-05-10T16:05:00.000Z'
    });

    expect(expiredResponse).toEqual({
      status: 410,
      error: {
        code: 'TOKEN_EXPIRED',
        message: expect.stringMatching(/expired/i)
      }
    });

    const policyClient = buildRpcClient({
      data: null,
      error: {
        code: 'POLICY_WINDOW_CLOSED',
        message: 'Policy window closed'
      }
    });

    const policyApi = await wireGateway(policyClient.client);
    const policyResponse = await policyApi.manageBookingByToken({
      token: 'tok_valid_appt-qa-001',
      nowIso: '2026-05-10T15:20:00.000Z'
    });

    expect(policyResponse).toEqual({
      status: 403,
      error: {
        code: 'POLICY_WINDOW_CLOSED',
        message: expect.stringMatching(/policy|window|closed/i)
      }
    });
  });

  it('maps manual booking conflict RPC outcome into SLOT_CONFLICT (409)', async () => {
    const { client, rpcSpy } = buildRpcClient({
      data: null,
      error: {
        code: 'SLOT_CONFLICT',
        message: 'Overlap with occupied appointment'
      }
    });

    const api = await wireGateway(client);
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

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('create_admin_manual_booking', expect.any(Object));
  });

  it('maps blocked-time conflict RPC outcome into BLOCKED_TIME_COLLISION (409)', async () => {
    const { client, rpcSpy } = buildRpcClient({
      data: null,
      error: {
        code: 'BLOCKED_TIME_COLLISION',
        message: 'Overlap with existing blocked window'
      }
    });

    const api = await wireGateway(client);
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

    expect(rpcSpy).toHaveBeenCalledTimes(1);
    expect(rpcSpy).toHaveBeenCalledWith('create_admin_blocked_time', expect.any(Object));
  });
});
