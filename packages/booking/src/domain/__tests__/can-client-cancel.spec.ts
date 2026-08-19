import { describe, expect, it } from 'vitest';
import { canClientCancelOrReschedule } from '../booking-core';

describe('canClientCancelOrReschedule', () => {
  it('allows cancel at least one hour before start', () => {
    expect(
      canClientCancelOrReschedule({
        appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
        nowIso: '2026-06-01T09:00:00.000Z'
      })
    ).toEqual({ allowed: true });
  });

  it('closes the policy inside the one-hour window', () => {
    expect(
      canClientCancelOrReschedule({
        appointmentStartAtIso: '2026-06-01T10:00:00.000Z',
        nowIso: '2026-06-01T09:00:01.000Z'
      })
    ).toEqual({ allowed: false, reason: 'POLICY_WINDOW_CLOSED' });
  });
});
