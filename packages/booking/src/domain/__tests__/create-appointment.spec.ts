import { describe, expect, it } from 'vitest';
import { createAppointment, type CalendarEntry } from '../booking-core';

describe('createAppointment', () => {
  it('confirms an admin-manual appointment', () => {
    expect(
      createAppointment(
        {
          id: 'apt-new',
          source: 'admin-manual',
          startAtIso: '2026-06-01T10:00:00.000Z',
          endAtIso: '2026-06-01T10:30:00.000Z'
        },
        []
      )
    ).toEqual({
      id: 'apt-new',
      source: 'admin-manual',
      status: 'confirmed',
      startAtIso: '2026-06-01T10:00:00.000Z',
      endAtIso: '2026-06-01T10:30:00.000Z',
      notes: undefined
    });
  });

  it('rejects an invalid range', () => {
    expect(() =>
      createAppointment(
        {
          id: 'apt-invalid',
          source: 'admin-manual',
          startAtIso: '2026-06-01T10:00:00.000Z',
          endAtIso: '2026-06-01T10:00:00.000Z'
        },
        []
      )
    ).toThrow('INVALID_APPOINTMENT_RANGE');
  });

  it('rejects overlap with an active entry', () => {
    const existing: CalendarEntry[] = [
      {
        id: 'apt-existing',
        type: 'appointment',
        startAtIso: '2026-06-01T10:00:00.000Z',
        endAtIso: '2026-06-01T11:00:00.000Z',
        status: 'confirmed'
      }
    ];

    expect(() =>
      createAppointment(
        {
          id: 'apt-new',
          source: 'admin-manual',
          startAtIso: '2026-06-01T10:30:00.000Z',
          endAtIso: '2026-06-01T11:00:00.000Z'
        },
        existing
      )
    ).toThrow('APPOINTMENT_OVERLAP');
  });
});
