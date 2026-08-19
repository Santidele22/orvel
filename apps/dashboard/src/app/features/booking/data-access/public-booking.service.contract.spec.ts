// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { inject, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const gatewayMocks = vi.hoisted(() => ({
  resolveBusinessBySlug: vi.fn(),
  queryPublicSlotAvailability: vi.fn(),
  createPublicBooking: vi.fn(),
  manageBookingByToken: vi.fn(),
  cancelBookingByToken: vi.fn(),
  rescheduleBookingByToken: vi.fn()
}));

const supabaseMocks = vi.hoisted(() => ({
  createClient: vi.fn(() => ({
    rpc: vi.fn(async () => {
      throw new Error('PublicBookingService must use the injected gateway, not direct RPC calls');
    }),
    from: vi.fn(() => {
      throw new Error('PublicBookingService must not perform raw table lookups');
    })
  }))
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: supabaseMocks.createClient
}));

vi.mock('@orvel/booking/infrastructure', () => ({
  RealSupabaseBookingGateway: class {
    resolveBusinessBySlug = gatewayMocks.resolveBusinessBySlug;
    queryPublicSlotAvailability = gatewayMocks.queryPublicSlotAvailability;
    createPublicBooking = gatewayMocks.createPublicBooking;
    manageBookingByToken = gatewayMocks.manageBookingByToken;
    cancelBookingByToken = gatewayMocks.cancelBookingByToken;
    rescheduleBookingByToken = gatewayMocks.rescheduleBookingByToken;
  }
}));

import { RealSupabaseBookingGateway } from '@orvel/booking/infrastructure';
import { PublicBookingService } from './public-booking.service';

const serviceSource = readFileSync(
  resolve(process.cwd(), 'src/app/features/booking/data-access/public-booking.service.ts'),
  'utf8'
);

function makeService(): PublicBookingService {
  return TestBed.inject(PublicBookingService);
}

describe('PublicBookingService canonical booking runtime contract', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: PublicBookingService, useFactory: () => new PublicBookingService(inject(RealSupabaseBookingGateway)) },
        { provide: RealSupabaseBookingGateway, useClass: RealSupabaseBookingGateway }
      ]
    });
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('statically forbids raw manage token table storage lookup in public-booking.service.ts', () => {
    expect(serviceSource).not.toMatch(/\.from\(['"]bookings['"]\)/);
    expect(serviceSource).not.toMatch(/\.eq\(['"]manage_token['"]\s*,\s*token\)/);
    expect(serviceSource).not.toMatch(/select\([^)]*manage_token/);
  });

  it('does not create its own Supabase client for public booking runtime calls', async () => {
    gatewayMocks.queryPublicSlotAvailability.mockResolvedValueOnce({ status: 200, data: { slots: [] } });

    const service = makeService();
    await service.queryPublicSlotAvailability({
      businessSlug: 'orvel-demo',
      serviceId: 'svc-1',
      dateIso: '2026-06-01'
    });

    expect(supabaseMocks.createClient).not.toHaveBeenCalled();
  });

  it('routes public resolve, availability, create, manage, cancel, and reschedule flows through the injected gateway', async () => {
    gatewayMocks.resolveBusinessBySlug.mockResolvedValueOnce({ status: 200, data: { id: 'biz-1' } });
    gatewayMocks.queryPublicSlotAvailability.mockResolvedValueOnce({ status: 200, data: { slots: [] } });
    gatewayMocks.createPublicBooking.mockResolvedValueOnce({
      status: 201,
      data: {
        bookingId: 'booking-1',
        status: 'confirmed',
        source: 'client-self-service',
        manageToken: 'raw-token-returned-once'
      }
    });
    gatewayMocks.manageBookingByToken.mockResolvedValueOnce({
      status: 200,
      data: {
        bookingId: 'booking-1',
        businessId: 'biz-1',
        serviceId: 'svc-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: true
      }
    });
    gatewayMocks.cancelBookingByToken.mockResolvedValueOnce({ status: 200, data: { bookingId: 'booking-1', status: 'cancelled' } });
    gatewayMocks.rescheduleBookingByToken.mockResolvedValueOnce({
      status: 200,
      data: { bookingId: 'booking-1', startsAtIso: '2026-06-01T11:00:00.000Z' }
    });

    const service = makeService();

    await expect(service.resolveBusinessBySlug({ businessSlug: 'orvel-demo' })).resolves.toMatchObject({ status: 200 });
    await expect(
      service.queryPublicSlotAvailability({ businessSlug: 'orvel-demo', serviceId: 'svc-1', dateIso: '2026-06-01' })
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      service.createPublicBooking({
        businessSlug: 'orvel-demo',
        serviceId: 'svc-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Leia Organa', email: 'leia@example.com' }
      })
    ).resolves.toMatchObject({ status: 201 });
    await expect(service.manageBookingByToken('token-1', '2026-06-01T08:00:00.000Z')).resolves.toMatchObject({ status: 200 });
    await expect(service.cancelBookingByToken('token-1', '2026-06-01T08:00:00.000Z')).resolves.toMatchObject({ status: 200 });
    await expect(
      service.rescheduleBookingByToken('token-1', '2026-06-01T08:00:00.000Z', '2026-06-01T11:00:00.000Z')
    ).resolves.toMatchObject({ status: 200 });

    expect(gatewayMocks.resolveBusinessBySlug).toHaveBeenCalledWith({ businessSlug: 'orvel-demo' });
    expect(gatewayMocks.queryPublicSlotAvailability).toHaveBeenCalledWith({
      businessSlug: 'orvel-demo',
      serviceId: 'svc-1',
      dateIso: '2026-06-01'
    });
    expect(gatewayMocks.createPublicBooking).toHaveBeenCalledWith({
      businessSlug: 'orvel-demo',
      serviceId: 'svc-1',
      startsAtIso: '2026-06-01T10:00:00.000Z',
      client: { fullName: 'Leia Organa', email: 'leia@example.com' }
    });
    expect(gatewayMocks.manageBookingByToken).toHaveBeenCalledWith({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' });
    expect(gatewayMocks.cancelBookingByToken).toHaveBeenCalledWith({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' });
    expect(gatewayMocks.rescheduleBookingByToken).toHaveBeenCalledWith({
      token: 'token-1',
      nowIso: '2026-06-01T08:00:00.000Z',
      startsAtIso: '2026-06-01T11:00:00.000Z'
    });
  });

  it('trusts manageBookingByToken gateway payload and never runs an extra bookings table lookup', async () => {
    gatewayMocks.manageBookingByToken.mockResolvedValueOnce({
      status: 200,
      data: {
        bookingId: 'booking-from-rpc',
        businessId: 'biz-from-rpc',
        serviceId: 'svc-from-rpc',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: false
      }
    });

    const response = await makeService().manageBookingByToken('raw-manage-token', '2026-06-01T09:30:00.000Z');

    expect(response).toEqual({
      status: 200,
      data: {
        bookingId: 'booking-from-rpc',
        businessId: 'biz-from-rpc',
        serviceId: 'svc-from-rpc',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: false
      }
    });
    expect(gatewayMocks.manageBookingByToken).toHaveBeenCalledWith({
      token: 'raw-manage-token',
      nowIso: '2026-06-01T09:30:00.000Z'
    });
  });

  it('propagates manageToken from createPublicBooking backend response when the RPC returns it once', async () => {
    gatewayMocks.createPublicBooking.mockResolvedValueOnce({
      status: 201,
      data: {
        bookingId: 'booking-1',
        status: 'confirmed',
        source: 'client-self-service',
        manageToken: 'raw-token-returned-once'
      }
    });

    const response = await makeService().createPublicBooking({
      businessSlug: 'orvel-demo',
      serviceId: 'svc-1',
      startsAtIso: '2026-06-01T10:00:00.000Z',
      client: { fullName: 'Leia Organa', email: 'leia@example.com' }
    });

    expect(response).toMatchObject({
      status: 201,
      data: { bookingId: 'booking-1', manageToken: 'raw-token-returned-once' }
    });
  });

  it.each(['INVALID_TOKEN', 'TOKEN_EXPIRED', 'POLICY_WINDOW_CLOSED', 'SLOT_CONFLICT'] as const)(
    'preserves deterministic %s errors from the canonical gateway',
    async (code) => {
      gatewayMocks.manageBookingByToken.mockResolvedValueOnce({
        status: 400,
        error: { code, message: code }
      });

      await expect(makeService().manageBookingByToken('token-1', '2026-06-01T09:30:00.000Z')).resolves.toEqual({
        status: 400,
        error: { code, message: code }
      });
    }
  );
});
