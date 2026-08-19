import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { PublicBookingService } from '../public-booking.facade';
import type { SupabaseBookingGateway } from '../../gateway-interface';

const source = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../public-booking.facade.ts'), 'utf8');

function fakeGateway(overrides: Partial<SupabaseBookingGateway> = {}): SupabaseBookingGateway {
  return {
    resolveBusinessBySlug: vi.fn(),
    queryPublicSlotAvailability: vi.fn(),
    createPublicBooking: vi.fn(),
    manageBookingByToken: vi.fn(),
    cancelBookingByToken: vi.fn(),
    rescheduleBookingByToken: vi.fn(),
    ...overrides
  } as unknown as SupabaseBookingGateway;
}

describe('PublicBookingService facade', () => {
  it('is a plain class with no Angular DI or raw supabase access', () => {
    expect(source).not.toMatch(/@Injectable|inject\(|createClient|\.rpc\(|\.from\(['"]bookings['"]\)/);
    expect(source).not.toMatch(/\.eq\(['"]manage_token['"]\s*,\s*token\)/);
    expect(source).not.toMatch(/select\([^)]*manage_token/);
  });

  it('routes all six public flows through the gateway port', async () => {
    const gateway = fakeGateway();
    vi.mocked(gateway.resolveBusinessBySlug).mockResolvedValue({ status: 200, data: { id: 'biz-1' } } as never);
    vi.mocked(gateway.queryPublicSlotAvailability).mockResolvedValue({ status: 200, data: { slots: [] } });
    vi.mocked(gateway.createPublicBooking).mockResolvedValue({
      status: 201,
      data: { bookingId: 'b-1', status: 'confirmed', source: 'client-self-service', manageToken: 'tok' }
    });
    vi.mocked(gateway.manageBookingByToken).mockResolvedValue({
      status: 200,
      data: {
        bookingId: 'b-1',
        businessId: 'biz-1',
        serviceId: 's-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: true
      }
    });
    vi.mocked(gateway.cancelBookingByToken).mockResolvedValue({
      status: 200,
      data: { bookingId: 'b-1', status: 'cancelled' }
    });
    vi.mocked(gateway.rescheduleBookingByToken).mockResolvedValue({
      status: 200,
      data: { bookingId: 'b-1', startsAtIso: '2026-06-01T11:00:00.000Z' }
    });

    const svc = new PublicBookingService(gateway);
    await expect(svc.resolveBusinessBySlug({ businessSlug: 'orvel-demo' })).resolves.toMatchObject({ status: 200 });
    await expect(
      svc.queryPublicSlotAvailability({ businessSlug: 'orvel-demo', serviceId: 's-1', dateIso: '2026-06-01' })
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      svc.createPublicBooking({
        businessSlug: 'orvel-demo',
        serviceId: 's-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Leia Organa', email: 'leia@example.com' }
      })
    ).resolves.toMatchObject({ status: 201, data: { manageToken: 'tok' } });
    await expect(svc.manageBookingByToken('token-1', '2026-06-01T08:00:00.000Z')).resolves.toMatchObject({
      status: 200
    });
    await expect(svc.cancelBookingByToken('token-1', '2026-06-01T08:00:00.000Z')).resolves.toMatchObject({
      status: 200
    });
    await expect(
      svc.rescheduleBookingByToken('token-1', '2026-06-01T08:00:00.000Z', '2026-06-01T11:00:00.000Z')
    ).resolves.toMatchObject({ status: 200 });

    expect(gateway.resolveBusinessBySlug).toHaveBeenCalledWith({ businessSlug: 'orvel-demo' });
    expect(gateway.queryPublicSlotAvailability).toHaveBeenCalledWith({
      businessSlug: 'orvel-demo',
      serviceId: 's-1',
      dateIso: '2026-06-01'
    });
    expect(gateway.createPublicBooking).toHaveBeenCalledWith({
      businessSlug: 'orvel-demo',
      serviceId: 's-1',
      startsAtIso: '2026-06-01T10:00:00.000Z',
      client: { fullName: 'Leia Organa', email: 'leia@example.com' }
    });
    expect(gateway.manageBookingByToken).toHaveBeenCalledWith({
      token: 'token-1',
      nowIso: '2026-06-01T08:00:00.000Z'
    });
    expect(gateway.cancelBookingByToken).toHaveBeenCalledWith({
      token: 'token-1',
      nowIso: '2026-06-01T08:00:00.000Z'
    });
    expect(gateway.rescheduleBookingByToken).toHaveBeenCalledWith({
      token: 'token-1',
      nowIso: '2026-06-01T08:00:00.000Z',
      startsAtIso: '2026-06-01T11:00:00.000Z'
    });
  });

  it('trusts manage payload and preserves deterministic error codes', async () => {
    const payload = {
      bookingId: 'booking-from-rpc',
      businessId: 'biz-from-rpc',
      serviceId: 'svc-from-rpc',
      startsAtIso: '2026-06-01T10:00:00.000Z',
      canCancelOrReschedule: false
    };
    const gateway = fakeGateway({
      manageBookingByToken: vi
        .fn()
        .mockResolvedValueOnce({ status: 200, data: payload })
        .mockResolvedValueOnce({ status: 400, error: { code: 'INVALID_TOKEN', message: 'INVALID_TOKEN' } })
        .mockResolvedValueOnce({ status: 400, error: { code: 'TOKEN_EXPIRED', message: 'TOKEN_EXPIRED' } })
        .mockResolvedValueOnce({
          status: 400,
          error: { code: 'POLICY_WINDOW_CLOSED', message: 'POLICY_WINDOW_CLOSED' }
        })
        .mockResolvedValueOnce({ status: 400, error: { code: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT' } })
    });
    const svc = new PublicBookingService(gateway);
    expect(await svc.manageBookingByToken('raw-manage-token', '2026-06-01T09:30:00.000Z')).toEqual({
      status: 200,
      data: payload
    });
    for (const code of ['INVALID_TOKEN', 'TOKEN_EXPIRED', 'POLICY_WINDOW_CLOSED', 'SLOT_CONFLICT'] as const) {
      await expect(svc.manageBookingByToken('token-1', '2026-06-01T09:30:00.000Z')).resolves.toEqual({
        status: 400,
        error: { code, message: code }
      });
    }
  });
});
