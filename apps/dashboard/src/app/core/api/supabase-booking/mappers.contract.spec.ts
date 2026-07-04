import { describe, expect, it } from 'vitest';
import { mapRpcErrorToApiError } from './mappers';

describe('mapRpcErrorToApiError self-service token policy mappings', () => {
  it.each(['TOKEN_REVOKED', 'BOOKING_ALREADY_CANCELLED'] as const)(
    'preserves %s as a stable API error code instead of falling back to validation',
    (code) => {
      expect(
        mapRpcErrorToApiError({
          code,
          message: code
        })
      ).toEqual({
        code,
        message: code
      });
    }
  );
});

describe('mapRpcErrorToApiError booking domain diagnostics', () => {
  it.each(['BOOKING_VALIDATION_ERROR', 'BRANCH_NOT_FOUND', 'SERVICE_NOT_FOUND'] as const)(
    'preserves %s from the direct RPC code',
    (code) => {
      expect(
        mapRpcErrorToApiError({
          code,
          message: `Backend raised ${code}`
        })
      ).toEqual({
        code,
        message: `Backend raised ${code}`
      });
    }
  );

  it.each(['BOOKING_VALIDATION_ERROR', 'BRANCH_NOT_FOUND', 'SERVICE_NOT_FOUND'] as const)(
    'preserves %s from a Supabase P0001 message',
    (code) => {
      expect(
        mapRpcErrorToApiError({
          code: 'P0001',
          message: `Backend raised ${code}`
        })
      ).toEqual({
        code,
        message: `Backend raised ${code}`
      });
    }
  );

  it('preserves Supabase RPC diagnostic details and hint for operational logging', () => {
    expect(
      mapRpcErrorToApiError({
        code: 'P0001',
        message: 'SLOT_CONFLICT from create_public_booking',
        details: 'Conflicts with bookings_pkey in public.bookings',
        hint: 'Check service duration and branch availability'
      })
    ).toEqual({
      code: 'SLOT_CONFLICT',
      message: 'SLOT_CONFLICT from create_public_booking',
      details: {
        rpcCode: 'P0001',
        rpcDetails: 'Conflicts with bookings_pkey in public.bookings',
        rpcHint: 'Check service duration and branch availability'
      }
    });
  });
});
