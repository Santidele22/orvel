import { describe, expect, it } from 'vitest';
import { computeAvailableSlots } from '../availability-core';
import { computePublicAvailability } from '../booking-core';

// REQ-DOMAIN-1 golden: proves UTC vs local-Date equivalence of the two
// availability implementations on frame-agnostic inputs, and pins the
// canonical UTC-policy slot set on a DST-boundary date (R4).
//
// Canonical policy is UTC: both functions must produce the same slot set
// under it. Frame-agnostic inputs (minNoticeMinutes = 0, no `now`) reduce
// both to pure minute-of-day math, so the slot set is identical in every
// timezone; the DST-boundary case pins the canonical UTC result.
describe('availability golden (UTC vs local-Date equivalence)', () => {
  it('yields the same slot set from both implementations for a known date range', () => {
    const shared = {
      date: '2026-06-01',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 0,
      workingWindows: [{ start: '09:00', end: '10:30' }]
    };

    const fromSlotsCore = computeAvailableSlots({ ...shared, occupiedWindows: [] });
    const fromPublic = computePublicAvailability({
      ...shared,
      nowIso: '2026-05-31T00:00:00.000Z',
      calendarEntries: []
    });

    expect(fromSlotsCore).toEqual(['09:00', '09:30', '10:00']);
    expect(fromPublic).toEqual(fromSlotsCore);
  });

  it('applies buffer collisions identically in both implementations', () => {
    const shared = {
      date: '2026-06-01',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferMinutes: 10,
      minNoticeMinutes: 0,
      workingWindows: [{ start: '09:00', end: '11:00' }]
    };

    const fromSlotsCore = computeAvailableSlots({
      ...shared,
      occupiedWindows: [{ start: '09:30', end: '10:00' }]
    });
    const fromPublic = computePublicAvailability({
      ...shared,
      nowIso: '2026-05-31T00:00:00.000Z',
      calendarEntries: [
        {
          id: 'booking-1',
          type: 'appointment',
          startAtIso: '2026-06-01T09:30:00.000Z',
          endAtIso: '2026-06-01T10:00:00.000Z',
          status: 'confirmed'
        }
      ]
    });

    expect(fromSlotsCore).toEqual(['10:30']);
    expect(fromPublic).toEqual(fromSlotsCore);
  });

  it('pins the canonical UTC slot set on a DST-boundary date (2026-03-08)', () => {
    // 2026-03-08 is the US spring-forward date. The canonical UTC policy
    // produces deterministic slots regardless of host timezone; a local-Date
    // framing would shift the min-notice boundary by the TZ offset.
    const nowIso = '2026-03-08T08:00:00.000Z';
    const shared = {
      date: '2026-03-08',
      serviceDurationMinutes: 30,
      slotIntervalMinutes: 30,
      bufferMinutes: 0,
      minNoticeMinutes: 60,
      workingWindows: [{ start: '08:00', end: '10:00' }]
    };

    const fromSlotsCore = computeAvailableSlots({ ...shared, occupiedWindows: [], now: new Date(nowIso) });
    const fromPublic = computePublicAvailability({ ...shared, nowIso, calendarEntries: [] });

    expect(fromSlotsCore).toEqual(['09:00', '09:30']);
    expect(fromPublic).toEqual(fromSlotsCore);
  });
});
