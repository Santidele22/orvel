import { describe, expect, it, vi } from 'vitest';
import { createSupabaseBookingGateway } from './supabase-booking.gateway';

const okRpc = (data: unknown) => Promise.resolve({ data, error: null });
const errorRpc = (code: string, message = code) => Promise.resolve({ data: null, error: { code, message } });

describe('MVP phase 1 booking gateway RED contracts', () => {
  it('M1 does not synthesize public slot capacity when Supabase RPC returns zero remaining capacity', async () => {
    const gateway = createSupabaseBookingGateway({
      client: {
        rpc: vi.fn(() =>
          okRpc([
            {
              starts_at_iso: '2026-06-01T10:00:00.000Z',
              ends_at_iso: '2026-06-01T10:30:00.000Z',
              remaining_capacity: 0
            }
          ])
        )
      }
    });

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
  });

  it('M5 cancel-by-management-key validates malformed payloads locally before calling RPC', async () => {
    const rpc = vi.fn(() => okRpc({ booking_id: 'booking-1', status: 'cancelled' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(gateway.cancelBookingByToken({ token: '', nowIso: 'not-an-iso-date' })).resolves.toMatchObject({
      status: 422,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_TOKEN', 401],
    ['TOKEN_EXPIRED', 410],
    ['POLICY_WINDOW_CLOSED', 403]
  ] as const)('M5 maps cancel-by-management-key %s to deterministic status %i', async (code, status) => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc(code, code)) }
    });

    await expect(
      gateway.cancelBookingByToken({ token: 'manage-key-1', nowIso: '2026-06-01T08:30:00.000Z' })
    ).resolves.toEqual({
      status,
      error: { code, message: code, details: undefined }
    });
  });

  it('M6 reschedule-by-management-key validates malformed payloads locally before calling RPC', async () => {
    const rpc = vi.fn(() => okRpc({ bookingId: 'booking-1', startsAtIso: '2026-06-01T11:00:00.000Z' }));
    const gateway = createSupabaseBookingGateway({ client: { rpc } });

    await expect(
      gateway.rescheduleBookingByToken({ token: '', nowIso: 'not-an-iso-date', startsAtIso: 'also-not-an-iso-date' })
    ).resolves.toMatchObject({
      status: 422,
      error: { code: 'VALIDATION_ERROR' }
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_TOKEN', 401],
    ['TOKEN_EXPIRED', 410],
    ['POLICY_WINDOW_CLOSED', 403],
    ['SLOT_CONFLICT', 409]
  ] as const)('M6 maps reschedule-by-management-key %s to deterministic status %i', async (code, status) => {
    const gateway = createSupabaseBookingGateway({
      client: { rpc: vi.fn(() => errorRpc(code, code)) }
    });

    await expect(
      gateway.rescheduleBookingByToken({
        token: 'manage-key-1',
        nowIso: '2026-06-01T08:30:00.000Z',
        startsAtIso: '2026-06-01T11:00:00.000Z'
      })
    ).resolves.toEqual({
      status,
      error: { code, message: code, details: undefined }
    });
  });
});
