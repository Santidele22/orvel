import type { BookingRecord } from '../booking-record';

export type AvailabilityWindow = {
  startsAt: Date;
  endsAt: Date;
};

export type BookingCounts = {
  total: number;
  hoy: number;
  futuros: number;
};

export function utcDayRange(day: Date): { from: Date; to: Date } {
  const from = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const to = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 1));
  return { from, to };
}

export interface BookingQueries {
  listBookingsByBranch(branchId: string, range: { from: Date; to: Date }): Promise<BookingRecord[]>;
  getAvailabilityWindows(branchId: string, day: Date): Promise<AvailabilityWindow[]>;
  getBookingCounts(branchId: string): Promise<BookingCounts>;
}
