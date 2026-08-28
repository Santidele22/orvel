import { describe, expect, it } from 'vitest';
import { cancelAppointment, type CalendarEntry } from '../booking-core';

const existing: CalendarEntry[] = [
  {
    id: 'apt-1',
    type: 'appointment',
    startAtIso: '2026-06-01T10:00:00.000Z',
    endAtIso: '2026-06-01T10:30:00.000Z',
    status: 'confirmed'
  }
];

describe('cancelAppointment', () => {
  it('returns a cancelled copy and does not mutate existing entries', () => {
    const snapshot = structuredClone(existing);
    expect(cancelAppointment('apt-1', existing)).toEqual({ ...existing[0], status: 'cancelled' });
    expect(existing).toEqual(snapshot);
  });

  it('throws APPOINTMENT_NOT_FOUND when the id is missing', () => {
    expect(() => cancelAppointment('missing', existing)).toThrow('APPOINTMENT_NOT_FOUND');
  });
});
