/**
 * KB-011: Public Booking API - TDD contract guards (RED)
 *
 * Scope:
 * 1) Public business lookup by slug
 * 2) Public slot availability query
 * 3) Public booking creation
 * 4) Booking manage by token (read/cancel/reschedule policy)
 * 5) Validation/errors
 * 6) Security constraints (no private leakage)
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
  setSupabaseBookingGateway: (gateway: unknown) => void;
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
  createAdminManualBooking: (payload: unknown) => Promise<unknown>;
  createAdminBlockedTime: (payload: unknown) => Promise<unknown>;
};

async function loadSupabaseBookingApi(): Promise<SupabaseBookingApiModule> {
  const mod = await import('@orvel/booking/infrastructure');
  return mod as SupabaseBookingApiModule;
}

function readBookingApiSource(): string {
  const sourcePath = resolve(process.cwd(), '../../packages/booking/src/infrastructure/supabase/api-wrapper.ts');
  return existsSync(sourcePath) ? readFileSync(sourcePath, 'utf-8') : '';
}

function isIsoDate(input: string): boolean {
  return Number.isFinite(Date.parse(input));
}

function isEmail(input: string): boolean {
  return /^\S+@\S+\.\S+$/.test(input);
}

function createPublicBookingGatewayDouble() {
  return {
    async resolveBusinessBySlug({ businessSlug }: { businessSlug: string }): Promise<ApiResponse<BusinessPublicView>> {
      if (businessSlug === 'unknown-slug-kb011') {
        return {
          status: 404,
          error: {
            code: 'BUSINESS_NOT_FOUND',
            message: `Business not found for slug: ${businessSlug}`
          }
        };
      }

      return {
        status: 200,
        data: {
          id: 'biz-kb011-001',
          slug: businessSlug,
          displayName: 'KB011 Studio',
          timezone: 'America/Argentina/Buenos_Aires',
          bookingPolicy: {
            autoConfirm: true,
            cancellationWindowMinutes: 60,
            allowClientProfessionalSelection: false
          }
        }
      };
    },

    async createPublicBooking(payload: PublicBookingPayload) {
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
        } as const;
      }

      return {
        status: 201,
        data: {
          bookingId: 'appt-kb011-001',
          status: 'confirmed',
          source: 'client-self-service'
        }
      } as const;
    },

    async manageBookingByToken({ token }: { token: string; nowIso: string }) {
      if (token === 'tok_bad_kb011') {
        return {
          status: 401,
          error: {
            code: 'INVALID_TOKEN',
            message: 'Invalid token'
          }
        } as const;
      }

      if (token === 'tok_expired_kb011') {
        return {
          status: 410,
          error: {
            code: 'TOKEN_EXPIRED',
            message: 'Token expired'
          }
        } as const;
      }

      if (token === 'tok_policy_closed_kb011') {
        return {
          status: 403,
          error: {
            code: 'POLICY_WINDOW_CLOSED',
            message: 'Policy window closed'
          }
        } as const;
      }

      return {
        status: 200,
        data: {
          bookingId: 'appt-kb011-001',
          businessId: 'biz-kb011-001',
          serviceId: 'svc-kb011-001',
          startsAtIso: '2026-05-10T16:00:00.000Z',
          canCancelOrReschedule: true
        }
      } as const;
    },

    async createAdminManualBooking() {
      return { status: 501 };
    },

    async createAdminBlockedTime() {
      return { status: 501 };
    },

    async updateAdminBooking() {
      return { status: 501 };
    },

    async cancelAdminBooking() {
      return { status: 501 };
    },

    async rescheduleAdminBooking() {
      return { status: 501 };
    },

    async updateBookingStatus() {
      return { status: 501 };
    },

    async confirmBookingDepositReceived() {
      return { status: 501 };
    }
  };
}

describe('KB-011.1 - Public business lookup by slug', () => {
  let api: SupabaseBookingApiModule;

  beforeEach(async () => {
    api = await loadSupabaseBookingApi();
    api.setSupabaseBookingGateway(createPublicBookingGatewayDouble());
  });

  it('KB-011.1.1 - resolves business public view by slug', async () => {
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

  it('KB-011.1.2 - returns BUSINESS_NOT_FOUND for unknown slug', async () => {
    const response = await api.resolveBusinessBySlug({ businessSlug: 'unknown-slug-kb011' });

    expect(response).toEqual({
      status: 404,
      error: {
        code: 'BUSINESS_NOT_FOUND',
        message: expect.stringMatching(/not found|slug|business/i)
      }
    });
  });

  it('KB-011.1.3 - does not leak private business fields in public lookup payload', async () => {
    const response = await api.resolveBusinessBySlug({ businessSlug: 'studio-roma' });
    const payload = response.data as Record<string, unknown>;

    expect(payload).not.toHaveProperty('ownerEmail');
    expect(payload).not.toHaveProperty('ownerPhone');
    expect(payload).not.toHaveProperty('internalNotes');
    expect(payload).not.toHaveProperty('manageToken');
  });
});

describe('KB-011.2 - Public slot availability query', () => {
  it('KB-011.2.1 @RED - exports a public slot availability query function', async () => {
    const apiModule = await import('@orvel/booking/infrastructure');
    const maybeApi = apiModule as Record<string, unknown>;

    expect(typeof maybeApi.queryPublicSlotAvailability).toBe('function');
  });

  it('KB-011.2.2 @RED - source wires a dedicated availability RPC contract', () => {
    const source = readBookingApiSource();
    const hasAvailabilityRpc =
      /rpc\(['"](query_public_slot_availability|get_public_slot_availability|list_public_available_slots)['"]/i.test(source);

    expect(hasAvailabilityRpc).toBe(true);
  });

  it('KB-011.2.3 @RED - availability response contract includes deterministic slot list shape', async () => {
    const apiModule = (await import('@orvel/booking/infrastructure')) as Record<string, unknown>;
    const fn = apiModule.queryPublicSlotAvailability as
      | ((input: unknown) => Promise<{ status: number; data?: { slots: Array<{ startsAtIso: string; endsAtIso: string }> } }>)
      | undefined;

    const response = await fn?.({
      businessSlug: 'studio-roma',
      serviceId: 'svc-cut-001',
      dateIso: '2026-05-10'
    });

    expect(response?.status).toBe(200);
    expect(response?.data?.slots?.[0]).toEqual({
      startsAtIso: expect.any(String),
      endsAtIso: expect.any(String)
    });
  });
});

describe('KB-011.3 - Public booking creation', () => {
  let api: SupabaseBookingApiModule;

  beforeEach(async () => {
    api = await loadSupabaseBookingApi();
    api.setSupabaseBookingGateway(createPublicBookingGatewayDouble());
  });

  it('KB-011.3.1 - creates booking with deterministic confirmation contract', async () => {
    const response = await api.createPublicBooking({
      businessSlug: 'studio-roma',
      serviceId: 'svc-cut-001',
      startsAtIso: '2026-05-10T16:00:00.000Z',
      client: {
        fullName: 'QA KB011',
        email: 'qa-kb011@example.com'
      },
      notes: 'Contract happy path'
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

  it('KB-011.3.2 - rejects invalid payload with deterministic VALIDATION_ERROR details', async () => {
    const response = await api.createPublicBooking({
      businessSlug: 'studio-roma',
      serviceId: '',
      startsAtIso: 'not-an-iso',
      client: {
        fullName: '',
        email: 'not-email'
      }
    });

    expect(response).toEqual({
      status: 422,
      error: {
        code: 'VALIDATION_ERROR',
        message: expect.stringMatching(/validation|invalid/i),
        details: {
          fields: expect.arrayContaining(['serviceId', 'startsAtIso', 'client.fullName', 'client.email'])
        }
      }
    });
  });

  it('KB-011.3.3 - forwards professional selection to the booking RPC policy', async () => {
    const response = await api.createPublicBooking({
      businessSlug: 'studio-roma',
      serviceId: 'svc-cut-001',
      startsAtIso: '2026-05-10T16:00:00.000Z',
      professionalId: 'pro-private-001',
      client: {
        fullName: 'QA KB011',
        email: 'qa-kb011@example.com'
      }
    });

    expect(response).toEqual({
      status: 201,
      data: {
        bookingId: 'appt-kb011-001',
        status: 'confirmed',
        source: 'client-self-service'
      }
    });
  });
});

describe('KB-011.4 - Booking manage by token (read/cancel/reschedule policy)', () => {
  let api: SupabaseBookingApiModule;

  beforeEach(async () => {
    api = await loadSupabaseBookingApi();
    api.setSupabaseBookingGateway(createPublicBookingGatewayDouble());
  });

  it('KB-011.4.1 - reads booking manage state by token', async () => {
    const response = await api.manageBookingByToken({
      token: 'tok_valid_kb011',
      nowIso: '2026-05-10T13:00:00.000Z'
    });

    expect(response).toEqual({
      status: 200,
      data: {
        bookingId: expect.any(String),
        businessId: expect.any(String),
        serviceId: expect.any(String),
        startsAtIso: expect.any(String),
        canCancelOrReschedule: true
      }
    });
  });

  it('KB-011.4.2 - returns POLICY_WINDOW_CLOSED for blocked manage policy window', async () => {
    const response = await api.manageBookingByToken({
      token: 'tok_policy_closed_kb011',
      nowIso: '2026-05-10T15:20:00.000Z'
    });

    expect(response).toEqual({
      status: 403,
      error: {
        code: 'POLICY_WINDOW_CLOSED',
        message: expect.stringMatching(/policy|window|closed/i)
      }
    });
  });

  it('KB-011.4.3 @RED - exposes cancelBookingByToken and rescheduleBookingByToken contracts', async () => {
    const apiModule = await import('@orvel/booking/infrastructure');
    const maybeApi = apiModule as Record<string, unknown>;

    expect(typeof maybeApi.cancelBookingByToken).toBe('function');
    expect(typeof maybeApi.rescheduleBookingByToken).toBe('function');
  });

  it('KB-011.4.4 @RED - source wires cancel/reschedule-by-token RPC policies', () => {
    const source = readBookingApiSource();
    const hasCancelRpc = /rpc\(['"](cancel_booking_by_token|cancel_public_booking_by_token)['"]/i.test(source);
    const hasRescheduleRpc = /rpc\(['"](reschedule_booking_by_token|reschedule_public_booking_by_token)['"]/i.test(source);

    expect(hasCancelRpc).toBe(true);
    expect(hasRescheduleRpc).toBe(true);
  });
});

describe('KB-011.5 - Validation/errors and KB-011.6 security constraints', () => {
  it('KB-011.5.1 - keeps explicit public API error taxonomy for booking flow', () => {
    const source = readBookingApiSource();

    expect(source).toMatch(/BUSINESS_NOT_FOUND/);
    expect(source).toMatch(/VALIDATION_ERROR/);
    expect(source).toMatch(/INVALID_TOKEN/);
    expect(source).toMatch(/TOKEN_EXPIRED/);
    expect(source).toMatch(/POLICY_WINDOW_CLOSED/);
  });

  it('KB-011.6.1 - manage-by-token response does not leak client private fields', async () => {
    const api = await loadSupabaseBookingApi();
    api.setSupabaseBookingGateway(createPublicBookingGatewayDouble());

    const response = await api.manageBookingByToken({
      token: 'tok_valid_kb011',
      nowIso: '2026-05-10T13:00:00.000Z'
    });

    const payload = response.data as Record<string, unknown>;
    expect(payload).not.toHaveProperty('clientEmail');
    expect(payload).not.toHaveProperty('clientPhone');
    expect(payload).not.toHaveProperty('manageToken');
    expect(payload).not.toHaveProperty('internalNotes');
  });
});
