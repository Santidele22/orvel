import { describe, expect, it } from 'vitest';
import { validateSelfServiceToken } from '../booking-core';

const valid = {
  token: 'tok_valid_booking-1',
  appointmentId: 'booking-1',
  appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
  nowIso: '2026-06-01T08:30:00.000Z'
};

describe('validateSelfServiceToken', () => {
  it('accepts a valid token outside the policy window', () => {
    expect(validateSelfServiceToken(valid)).toEqual({ valid: true });
  });

  it('rejects an invalid token', () => {
    expect(validateSelfServiceToken({ ...valid, token: 'wrong-token' })).toEqual({
      valid: false,
      reason: 'INVALID_TOKEN'
    });
  });

  it('rejects an expired token after appointment start', () => {
    expect(validateSelfServiceToken({ ...valid, nowIso: '2026-06-01T10:00:01.000Z' })).toEqual({
      valid: false,
      reason: 'TOKEN_EXPIRED'
    });
  });

  it('rejects a token inside the policy window', () => {
    expect(validateSelfServiceToken({ ...valid, nowIso: '2026-06-01T09:30:00.000Z' })).toEqual({
      valid: false,
      reason: 'POLICY_WINDOW_CLOSED'
    });
  });
});
