import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { utcDayRange } from '../../../application/ports/booking-queries';
import { SupabaseBookingQueries } from '../booking-queries.adapter';

const row = {
  id: 'b-1',
  branch_id: 'branch-1',
  customer_id: 'c-1',
  service_id: 's-1',
  starts_at: '2026-08-17T13:00:00.000Z',
  ends_at: '2026-08-17T13:30:00.000Z',
  status: 'booked',
  created_at: '2026-08-17T00:00:00.000Z'
};
const futureRow = {
  ...row,
  id: 'b-2',
  starts_at: '2099-01-15T13:00:00.000Z',
  ends_at: '2099-01-15T13:30:00.000Z'
};

const adapter = (rpc: ReturnType<typeof vi.fn>) =>
  new SupabaseBookingQueries({ rpc } as unknown as SupabaseClient);

describe('SupabaseBookingQueries adapter', () => {
  it('lists bookings via list_admin_bookings with UTC range bounds', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const listed = await adapter(rpc).listBookingsByBranch('branch-1', {
      from: new Date('2026-08-17T00:00:00.000Z'),
      to: new Date('2026-08-18T00:00:00.000Z')
    });
    expect(rpc).toHaveBeenCalledWith('list_admin_bookings', {
      p_branch_id: 'branch-1',
      p_starts_at: '2026-08-17T00:00:00.000Z',
      p_ends_at: '2026-08-18T00:00:00.000Z'
    });
    expect(listed).toMatchObject([{ id: 'b-1', clienteId: 'c-1', estado: 'confirmado', hora: '10:00' }]);
  });

  it('returns availability windows as UTC Date timestamps for the UTC day', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row], error: null });
    const windows = await adapter(rpc).getAvailabilityWindows(
      'branch-1',
      new Date('2026-08-17T15:30:00.000-03:00')
    );
    expect(rpc).toHaveBeenCalledWith('list_admin_bookings', {
      p_branch_id: 'branch-1',
      p_starts_at: '2026-08-17T00:00:00.000Z',
      p_ends_at: '2026-08-18T00:00:00.000Z'
    });
    expect(windows).toEqual([
      {
        startsAt: new Date('2026-08-17T13:00:00.000Z'),
        endsAt: new Date('2026-08-17T13:30:00.000Z')
      }
    ]);
    expect(windows[0].startsAt.toISOString().endsWith('Z')).toBe(true);
  });

  it('counts total, today, and future bookings and surfaces RPC errors', async () => {
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [row, futureRow], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'BRANCH_REQUIRED' } });
    const queries = adapter(rpc);
    const { from, to } = utcDayRange(new Date());
    const startsToday = new Date(row.starts_at);
    const expectedHoy = startsToday >= from && startsToday < to ? 1 : 0;
    expect(await queries.getBookingCounts('branch-1')).toEqual({ total: 2, hoy: expectedHoy, futuros: 1 });
    await expect(queries.listBookingsByBranch('branch-1', {
      from: new Date('2026-08-17T00:00:00.000Z'),
      to: new Date('2026-08-18T00:00:00.000Z')
    })).rejects.toThrow(/BRANCH_REQUIRED/);
  });
});
