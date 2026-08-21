import { InjectionToken } from '@angular/core';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingRecord } from '../../application/booking-record';
import { mapBookingRow } from '../../application/booking-record';
import {
  utcDayRange,
  type AvailabilityWindow,
  type BookingCounts,
  type BookingQueries
} from '../../application/ports/booking-queries';

export const BOOKING_QUERIES = new InjectionToken<BookingQueries>('BOOKING_QUERIES');

export class SupabaseBookingQueries implements BookingQueries {
  constructor(private readonly supabaseClient: SupabaseClient) {}

  async listBookingsByBranch(branchId: string, range: { from: Date; to: Date }): Promise<BookingRecord[]> {
    const rows = await this.listRows(branchId, range.from, range.to);
    return rows.map((row) => mapBookingRow(row, branchId));
  }

  async getAvailabilityWindows(branchId: string, day: Date): Promise<AvailabilityWindow[]> {
    const { from, to } = utcDayRange(day);
    const rows = await this.listRows(branchId, from, to);
    return rows.map((row) => ({
      startsAt: new Date(String(row['starts_at'])),
      endsAt: new Date(String(row['ends_at']))
    }));
  }

  async getBookingCounts(branchId: string): Promise<BookingCounts> {
    const rows = await this.listRows(branchId);
    const now = new Date();
    const { from, to } = utcDayRange(now);
    let hoy = 0;
    let futuros = 0;
    for (const row of rows) {
      const startsAt = new Date(String(row['starts_at']));
      if (startsAt >= from && startsAt < to) hoy += 1;
      if (startsAt > now) futuros += 1;
    }
    return { total: rows.length, hoy, futuros };
  }

  private async listRows(branchId: string, from?: Date, to?: Date): Promise<Record<string, unknown>[]> {
    const args: Record<string, unknown> = { p_branch_id: branchId };
    if (from) args['p_starts_at'] = from.toISOString();
    if (to) args['p_ends_at'] = to.toISOString();
    const { data, error } = await this.supabaseClient.rpc('list_admin_bookings', args);
    if (error) throw new Error(error.message);
    return (data ?? []) as Record<string, unknown>[];
  }
}
