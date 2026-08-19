import { describe, expect, it } from 'vitest';
import { rescheduleAppointment, type CalendarEntry } from '../booking-core';

const self: CalendarEntry = {
  id: 'apt-1',
  type: 'appointment',
  startAtIso: '2026-06-01T10:00:00.000Z',
  endAtIso: '2026-06-01T10:30:00.000Z',
  status: 'confirmed'
};

describe('rescheduleAppointment', () => {
  it('moves an existing appointment and keeps id/type with confirmed status', () => {
    expect(
      rescheduleAppointment(
        { id: 'apt-1', startAtIso: '2026-06-01T14:00:00.000Z', endAtIso: '2026-06-01T14:30:00.000Z' },
        [self]
      )
    ).toEqual({
      id: 'apt-1',
      type: 'appointment',
      startAtIso: '2026-06-01T14:00:00.000Z',
      endAtIso: '2026-06-01T14:30:00.000Z',
      status: 'confirmed'
    });
  });

  it('rejects a move that overlaps blocked time', () => {
    expect(() =>
      rescheduleAppointment(
        { id: 'apt-1', startAtIso: '2026-06-01T14:00:00.000Z', endAtIso: '2026-06-01T14:30:00.000Z' },
        [
          self,
          {
            id: 'block-1',
            type: 'blocked-time',
            startAtIso: '2026-06-01T14:00:00.000Z',
            endAtIso: '2026-06-01T15:00:00.000Z'
          }
        ]
      )
    ).toThrow('APPOINTMENT_OVERLAP');
  });

  it('throws APPOINTMENT_NOT_FOUND when the id is missing', () => {
    expect(() =>
      rescheduleAppointment(
        { id: 'missing', startAtIso: '2026-06-01T14:00:00.000Z', endAtIso: '2026-06-01T14:30:00.000Z' },
        [self]
      )
    ).toThrow('APPOINTMENT_NOT_FOUND');
  });

  it('rejects a zero-length range', () => {
    expect(() =>
      rescheduleAppointment(
        { id: 'apt-1', startAtIso: '2026-06-01T14:00:00.000Z', endAtIso: '2026-06-01T14:00:00.000Z' },
        [self]
      )
    ).toThrow('INVALID_APPOINTMENT_RANGE');
  });
});
