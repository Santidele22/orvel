import { describe, expect, it } from 'vitest';
import {
  utcDayRange,
  type AvailabilityWindow,
  type BookingQueries
} from '../ports/booking-queries';

function readOnlyQueries(): BookingQueries {
  return {
    listBookingsByBranch: async () => [],
    getAvailabilityWindows: async (_branchId, day) => {
      const { from, to } = utcDayRange(day);
      return [{ startsAt: from, endsAt: to }];
    },
    getBookingCounts: async () => ({ total: 0, hoy: 0, futuros: 0 })
  };
}

describe('BookingQueries contract', () => {
  it('exposes only the three read methods', () => {
    const port: BookingQueries = readOnlyQueries();
    expect(Object.keys(port).sort()).toEqual([
      'getAvailabilityWindows',
      'getBookingCounts',
      'listBookingsByBranch'
    ]);
    expect(port).not.toHaveProperty('createManualBooking');
    expect(port).not.toHaveProperty('cancel');
  });

  it('interprets getAvailabilityWindows day bounds in UTC', async () => {
    const port = readOnlyQueries();
    const sameUtcDay = new Date('2026-08-17T15:30:00.000-03:00');
    const crossesUtcMidnight = new Date('2026-08-17T21:30:00.000-03:00');
    const [sameDay] = await port.getAvailabilityWindows('branch-1', sameUtcDay);
    const [nextDay] = await port.getAvailabilityWindows('branch-1', crossesUtcMidnight);
    expect(sameDay.startsAt.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(sameDay.endsAt.toISOString()).toBe('2026-08-18T00:00:00.000Z');
    expect(nextDay.startsAt.toISOString()).toBe('2026-08-18T00:00:00.000Z');
    expect(nextDay.endsAt.toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  it('keeps utcDayRange stable across local offsets for the same UTC day', () => {
    const utcNoon = new Date('2026-08-17T12:00:00.000Z');
    const utcLate = new Date('2026-08-17T23:59:59.000Z');
    expect(utcDayRange(utcNoon)).toEqual(utcDayRange(utcLate));
    expect(utcDayRange(utcNoon).from.toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(utcDayRange(new Date('2026-08-18T00:00:00.000Z')).from.toISOString()).toBe(
      '2026-08-18T00:00:00.000Z'
    );
  });

  it('types availability windows as UTC Date timestamps', () => {
    const window: AvailabilityWindow = {
      startsAt: new Date('2026-08-17T13:00:00.000Z'),
      endsAt: new Date('2026-08-17T13:30:00.000Z')
    };
    expect(window.startsAt.toISOString()).toBe('2026-08-17T13:00:00.000Z');
    expect(window.endsAt.toISOString()).toBe('2026-08-17T13:30:00.000Z');
  });
});
