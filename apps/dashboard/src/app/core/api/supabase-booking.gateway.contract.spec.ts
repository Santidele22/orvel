import { describe, expect, it, vi } from 'vitest';
import { createSupabaseBookingGateway } from './supabase-booking.gateway';

describe('createSupabaseBookingGateway contract surface', () => {
  it('exposes every booking operation expected by runtime bootstrap', () => {
    const gateway = createSupabaseBookingGateway({
      client: {
        rpc: vi.fn(async () => ({
          data: null,
          error: null
        }))
      }
    });

    const expectedMethodNames = [
      'resolveBusinessBySlug',
      'queryPublicSlotAvailability',
      'createPublicBooking',
      'manageBookingByToken',
      'cancelBookingByToken',
      'rescheduleBookingByToken',
      'createAdminManualBooking',
      'createAdminBlockedTime',
      'updateAdminBooking',
      'cancelAdminBooking',
      'rescheduleAdminBooking',
      'updateBookingStatus'
    ] as const;

    for (const methodName of expectedMethodNames) {
      expect(typeof (gateway as Record<string, unknown>)[methodName]).toBe('function');
    }
  });
});
