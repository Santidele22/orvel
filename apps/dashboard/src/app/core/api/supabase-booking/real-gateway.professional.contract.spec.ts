import { describe, expect, it, vi } from 'vitest';
import { RealSupabaseBookingGateway } from '@orvel/booking/infrastructure';

function makeGateway(rpc: ReturnType<typeof vi.fn>) {
  return new RealSupabaseBookingGateway({ rpc } as never);
}

const validPayload = {
  businessSlug: 'demo-salon',
  serviceId: '11111111-1111-4111-8111-111111111111',
  startsAtIso: '2026-06-01T10:00:00.000Z',
  client: { fullName: 'Ada Lovelace', email: 'ada@example.test' },
  professionalId: '22222222-2222-4222-8222-222222222222'
};

describe('RealSupabaseBookingGateway professional selection', () => {
  it('forwards professionalId to create_public_booking instead of pre-rejecting', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        booking_id: 'booking-public-1',
        branch_id: 'branch-1',
        status: 'confirmed',
        manage_token: 'tok',
        db_atomic_visibility_notifications: true
      },
      error: null
    }));

    await expect(makeGateway(rpc).createPublicBooking(validPayload)).resolves.toMatchObject({
      status: 201,
      data: { bookingId: 'booking-public-1' }
    });

    expect(rpc).toHaveBeenCalledWith(
      'create_public_booking',
      expect.objectContaining({
        professional_id: validPayload.professionalId
      })
    );
  });

  it('maps CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN RPC errors to 422', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN',
        message: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN'
      }
    }));

    await expect(makeGateway(rpc).createPublicBooking(validPayload)).resolves.toMatchObject({
      status: 422,
      error: { code: 'CLIENT_PROFESSIONAL_SELECTION_FORBIDDEN' }
    });
    expect(rpc).toHaveBeenCalled();
  });

  it('calls the 4-arg availability RPC when professionalId is present', async () => {
    const rpc = vi.fn(async () => ({ data: [], error: null }));

    await makeGateway(rpc).queryPublicSlotAvailability({
      businessSlug: 'demo-salon',
      serviceId: validPayload.serviceId,
      dateIso: '2026-06-01',
      professionalId: validPayload.professionalId
    });

    expect(rpc).toHaveBeenCalledWith('query_public_slot_availability', {
      business_slug: 'demo-salon',
      service_id: validPayload.serviceId,
      date_iso: '2026-06-01',
      professional_id: validPayload.professionalId
    });
  });
});
