import { describe, expect, it } from 'vitest';
import { mapPublicTurneroDisabledError } from './mappers';

describe('public turnero disabled mapper', () => {
  it('maps PUBLIC_TURNERO_DISABLED to a non-500 unavailable API error', () => {
    expect(mapPublicTurneroDisabledError({ code: 'PUBLIC_TURNERO_DISABLED', message: 'PUBLIC_TURNERO_DISABLED' })).toEqual({
      status: 422,
      code: 'PUBLIC_TURNERO_DISABLED',
      message: 'Public booking is temporarily unavailable.'
    });
  });

  it('returns null for unrelated RPC codes', () => {
    expect(mapPublicTurneroDisabledError({ code: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT' })).toBeNull();
  });
});
