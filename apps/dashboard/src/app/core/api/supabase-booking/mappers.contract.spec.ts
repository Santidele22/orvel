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
