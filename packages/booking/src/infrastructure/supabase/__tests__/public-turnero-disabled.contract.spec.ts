import { describe, expect, it, vi } from 'vitest';
import { PUBLIC_TURNERO_DISABLED_MESSAGE } from '../mappers';
import { RealSupabaseBookingGateway } from '../real-gateway';

// `_assert_business_accepts_public_bookings` (migration
// 20260824201000_public_turnero_unconfirmed_gate.sql) rejects the anonymous
// booking RPCs while the business has not confirmed its product email, and the
// migration comment states that only the public turnero is affected.
//
// Before this contract the code fell through `mapRpcErrorToApiError` into a
// generic VALIDATION_ERROR/400, so the client could not tell "temporarily
// unavailable" from a malformed request. The anonymous dashboard gateway used
// to map it, but that implementation was dead code; this pins the behaviour on
// the live gateway.

const DISABLED_ERROR = { code: 'P0001', message: 'PUBLIC_TURNERO_DISABLED' };

function gatewayReturning(error: { code?: string; message?: string }) {
  const rpc = vi.fn(async () => ({ data: null, error }));
  return { gateway: new RealSupabaseBookingGateway({ rpc, from: vi.fn() } as never), rpc };
}

const AVAILABILITY_INPUT = {
  businessSlug: 'canonical-studio',
  serviceId: 'service-1',
  dateIso: '2026-10-01'
};

const CREATE_INPUT = {
  businessSlug: 'canonical-studio',
  serviceId: 'service-1',
  startsAtIso: '2026-10-01T15:00:00.000Z',
  client: { fullName: 'Ada Lovelace', email: 'ada@example.com' }
};

describe('anonymous turnero disabled contract', () => {
  it('maps PUBLIC_TURNERO_DISABLED from slot availability to 422 with reader-facing copy', async () => {
    const { gateway } = gatewayReturning(DISABLED_ERROR);

    const response = await gateway.queryPublicSlotAvailability(AVAILABILITY_INPUT);

    expect(response).toEqual({
      status: 422,
      error: {
        code: 'PUBLIC_TURNERO_DISABLED',
        message: PUBLIC_TURNERO_DISABLED_MESSAGE
      }
    });
  });

  it('maps PUBLIC_TURNERO_DISABLED from create_public_booking to 422 with reader-facing copy', async () => {
    const { gateway } = gatewayReturning(DISABLED_ERROR);

    const response = await gateway.createPublicBooking(CREATE_INPUT);

    expect(response).toEqual({
      status: 422,
      error: {
        code: 'PUBLIC_TURNERO_DISABLED',
        message: PUBLIC_TURNERO_DISABLED_MESSAGE
      }
    });
  });

  it('keeps unrelated RPC failures as 400 so the new branch is not a blanket 422', async () => {
    const { gateway } = gatewayReturning({ code: 'P0001', message: 'SOMETHING_ELSE' });

    const response = await gateway.queryPublicSlotAvailability(AVAILABILITY_INPUT);

    expect(response.status).toBe(400);
  });
});
