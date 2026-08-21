import { describe, expect, it, vi } from 'vitest';
import type { SupabaseBookingGateway } from '../../gateway-interface';
import {
  cancelAdminBooking,
  cancelBookingByToken,
  createAdminBlockedTime,
  createAdminManualBooking,
  createPublicBooking,
  manageBookingByToken,
  queryPublicSlotAvailability,
  resolveBusinessBySlug,
  rescheduleAdminBooking,
  rescheduleBookingByToken,
  setSupabaseBookingGateway,
  updateAdminBooking,
  updateBookingStatus
} from '../api-wrapper';

function createMockGateway(): SupabaseBookingGateway {
  return {
    resolveBusinessBySlug: vi.fn(async () => ({
      status: 200,
      data: {
        id: 'biz-1',
        slug: 'demo-salon',
        displayName: 'Demo Salon',
        timezone: 'UTC',
        bookingPolicy: {
          autoConfirm: true,
          cancellationWindowMinutes: 60,
          allowClientProfessionalSelection: false
        },
        settings: {
          bufferMinutes: 10,
          minNoticeMinutes: 120,
          slotIntervalMinutes: 30,
          workingHours: {}
        }
      }
    })),
    queryPublicSlotAvailability: vi.fn(async () => ({
      status: 200,
      data: { slots: [{ startsAtIso: '2026-06-01T10:00:00.000Z', endsAtIso: '2026-06-01T10:30:00.000Z' }] }
    })),
    createPublicBooking: vi.fn(async () => ({
      status: 201,
      data: { bookingId: 'booking-public', status: 'confirmed', source: 'client-self-service' }
    })),
    manageBookingByToken: vi.fn(async () => ({
      status: 200,
      data: {
        bookingId: 'booking-public',
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: true
      }
    })),
    cancelBookingByToken: vi.fn(async () => ({
      status: 200,
      data: { bookingId: 'booking-public', status: 'cancelled' }
    })),
    rescheduleBookingByToken: vi.fn(async () => ({
      status: 200,
      data: { bookingId: 'booking-public', startsAtIso: '2026-06-01T11:00:00.000Z' }
    })),
    createAdminManualBooking: vi.fn(async () => ({
      status: 201,
      data: { bookingId: 'booking-admin', type: 'manual-admin-appointment', status: 'confirmed', source: 'admin-manual' }
    })),
    createAdminBlockedTime: vi.fn(async () => ({
      status: 201,
      data: { blockId: 'block-1', type: 'blocked-time' }
    })),
    updateAdminBooking: vi.fn(async () => ({
      status: 200,
      data: { bookingId: 'booking-admin', updatedAt: '2026-06-01T09:00:00.000Z' }
    })),
    cancelAdminBooking: vi.fn(async () => ({
      status: 200,
      data: { bookingId: 'booking-admin', status: 'cancelled' }
    })),
    rescheduleAdminBooking: vi.fn(async () => ({
      status: 200,
      data: { bookingId: 'booking-admin', startsAtIso: '2026-06-01T12:00:00.000Z' }
    })),
    updateBookingStatus: vi.fn(async () => ({
      status: 200,
      data: { bookingId: 'booking-admin', status: 'completed' }
    }))
  };
}

describe('supabase-booking api-wrapper contract', () => {
  it('delegates every public booking API call to the injected gateway without live Supabase', async () => {
    const gateway = createMockGateway();
    setSupabaseBookingGateway(gateway);

    await expect(resolveBusinessBySlug({ businessSlug: 'demo-salon' })).resolves.toMatchObject({ status: 200 });
    await expect(
      queryPublicSlotAvailability({ businessSlug: 'demo-salon', serviceId: 'service-1', dateIso: '2026-06-01' })
    ).resolves.toMatchObject({ status: 200 });
    await expect(
      createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
      })
    ).resolves.toMatchObject({ status: 201 });
    await expect(manageBookingByToken({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' })).resolves.toMatchObject({
      status: 200
    });
    await expect(cancelBookingByToken({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' })).resolves.toMatchObject({
      status: 200
    });
    await expect(
      rescheduleBookingByToken({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z', startsAtIso: '2026-06-01T11:00:00.000Z' })
    ).resolves.toMatchObject({ status: 200 });

    expect(gateway.resolveBusinessBySlug).toHaveBeenCalledWith({ businessSlug: 'demo-salon' });
    expect(gateway.queryPublicSlotAvailability).toHaveBeenCalledWith({
      businessSlug: 'demo-salon',
      serviceId: 'service-1',
      dateIso: '2026-06-01'
    });
    expect(gateway.createPublicBooking).toHaveBeenCalledWith({
      businessSlug: 'demo-salon',
      serviceId: 'service-1',
      startsAtIso: '2026-06-01T10:00:00.000Z',
      client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
    });
    expect(gateway.manageBookingByToken).toHaveBeenCalledWith({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' });
    expect(gateway.cancelBookingByToken).toHaveBeenCalledWith({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' });
    expect(gateway.rescheduleBookingByToken).toHaveBeenCalledWith({
      token: 'token-1',
      nowIso: '2026-06-01T08:00:00.000Z',
      startsAtIso: '2026-06-01T11:00:00.000Z'
    });
  });

  it('returns exact public endpoint success shapes from the injected gateway', async () => {
    const gateway = createMockGateway();
    setSupabaseBookingGateway(gateway);

    await expect(resolveBusinessBySlug({ businessSlug: 'demo-salon' })).resolves.toEqual({
      status: 200,
      data: {
        id: 'biz-1',
        slug: 'demo-salon',
        displayName: 'Demo Salon',
        timezone: 'UTC',
        bookingPolicy: {
          autoConfirm: true,
          cancellationWindowMinutes: 60,
          allowClientProfessionalSelection: false
        },
        settings: {
          bufferMinutes: 10,
          minNoticeMinutes: 120,
          slotIntervalMinutes: 30,
          workingHours: {}
        }
      }
    });
    await expect(
      createPublicBooking({
        businessSlug: 'demo-salon',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        client: { fullName: 'Ada Lovelace', email: 'ada@example.test' }
      })
    ).resolves.toEqual({
      status: 201,
      data: { bookingId: 'booking-public', status: 'confirmed', source: 'client-self-service' }
    });
    await expect(manageBookingByToken({ token: 'token-1', nowIso: '2026-06-01T08:00:00.000Z' })).resolves.toEqual({
      status: 200,
      data: {
        bookingId: 'booking-public',
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        canCancelOrReschedule: true
      }
    });
  });

  it('delegates every admin booking API call to the injected gateway without live Supabase', async () => {
    const gateway = createMockGateway();
    setSupabaseBookingGateway(gateway);

    await expect(
      createAdminManualBooking({
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        durationMinutes: 30,
        professionalId: 'pro-1',
        performedBy: 'admin-1',
        notes: 'walk-in'
      })
    ).resolves.toMatchObject({ status: 201 });
    await expect(
      createAdminBlockedTime({
        businessId: 'biz-1',
        branchId: 'branch-1',
        startsAtIso: '2026-06-01T12:00:00.000Z',
        endsAtIso: '2026-06-01T13:00:00.000Z',
        reason: 'lunch',
        performedBy: 'admin-1'
      })
    ).resolves.toMatchObject({ status: 201 });
    await expect(updateAdminBooking({ bookingId: 'booking-admin', performedBy: 'admin-1', notes: 'updated' })).resolves.toMatchObject({
      status: 200
    });
    await expect(cancelAdminBooking({ bookingId: 'booking-admin', performedBy: 'admin-1', reason: 'customer request' })).resolves.toMatchObject({
      status: 200
    });
    await expect(
      rescheduleAdminBooking({ bookingId: 'booking-admin', performedBy: 'admin-1', startsAtIso: '2026-06-01T12:00:00.000Z' })
    ).resolves.toMatchObject({ status: 200 });
    await expect(updateBookingStatus({ bookingId: 'booking-admin', status: 'completed', performedBy: 'admin-1' })).resolves.toMatchObject({
      status: 200
    });

    expect(gateway.createAdminManualBooking).toHaveBeenCalledWith({
      businessId: 'biz-1',
      serviceId: 'service-1',
      startsAtIso: '2026-06-01T10:00:00.000Z',
      durationMinutes: 30,
      professionalId: 'pro-1',
      performedBy: 'admin-1',
      notes: 'walk-in'
    });
    expect(gateway.createAdminBlockedTime).toHaveBeenCalledWith({
      businessId: 'biz-1',
      branchId: 'branch-1',
      startsAtIso: '2026-06-01T12:00:00.000Z',
      endsAtIso: '2026-06-01T13:00:00.000Z',
      reason: 'lunch',
      performedBy: 'admin-1'
    });
    expect(gateway.updateAdminBooking).toHaveBeenCalledWith({ bookingId: 'booking-admin', performedBy: 'admin-1', notes: 'updated' });
    expect(gateway.cancelAdminBooking).toHaveBeenCalledWith({ bookingId: 'booking-admin', performedBy: 'admin-1', reason: 'customer request' });
    expect(gateway.rescheduleAdminBooking).toHaveBeenCalledWith({
      bookingId: 'booking-admin',
      performedBy: 'admin-1',
      startsAtIso: '2026-06-01T12:00:00.000Z'
    });
    expect(gateway.updateBookingStatus).toHaveBeenCalledWith({ bookingId: 'booking-admin', status: 'completed', performedBy: 'admin-1' });
  });

  it('returns exact admin endpoint success shapes from the injected gateway', async () => {
    const gateway = createMockGateway();
    setSupabaseBookingGateway(gateway);

    await expect(
      createAdminManualBooking({
        businessId: 'biz-1',
        serviceId: 'service-1',
        startsAtIso: '2026-06-01T10:00:00.000Z',
        durationMinutes: 30,
        professionalId: 'pro-1',
        performedBy: 'admin-1'
      })
    ).resolves.toEqual({
      status: 201,
      data: { bookingId: 'booking-admin', type: 'manual-admin-appointment', status: 'confirmed', source: 'admin-manual' }
    });
    await expect(
      createAdminBlockedTime({
        businessId: 'biz-1',
        branchId: 'branch-1',
        startsAtIso: '2026-06-01T12:00:00.000Z',
        endsAtIso: '2026-06-01T13:00:00.000Z',
        reason: 'lunch',
        performedBy: 'admin-1'
      })
    ).resolves.toEqual({ status: 201, data: { blockId: 'block-1', type: 'blocked-time' } });
  });
});
