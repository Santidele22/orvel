import { describe, expect, it, vi } from 'vitest';
import type { AdminBookingRepository } from '../ports/admin-booking.repository';
import { BookingCrudService } from '../booking-crud.service';
import { BookingSchedulingService } from '../booking-scheduling.service';
import { BookingAvailabilityService } from '../booking-availability.service';
import { BookingNotificationsService } from '../booking-notifications.service';
import type { BookingRecord } from '../booking-record';

const row = {
  id: 'b-1', branch_id: 'br-1', customer_id: 'c-1', service_id: 's-1',
  starts_at: '2026-08-17T13:00:00.000Z', ends_at: '2026-08-17T13:30:00.000Z',
  status: 'booked', created_at: '2026-08-17T00:00:00.000Z'
};
const future = new Date('2099-01-15T00:00:00.000Z');
const ctx = { businessId: 'biz-1', branchId: 'br-1', performedBy: 'admin-1' };
const notFound = { status: 400, error: { code: 'VALIDATION_ERROR', message: 'TURNO_NOT_FOUND' } };

describe('bounded capability services', () => {
  it('CRUD maps rows, filters, and translates mutation errors', async () => {
    const crud = new BookingCrudService({
      listBookings: vi.fn().mockResolvedValue({ data: [row], error: null }),
      cancel: vi.fn().mockResolvedValue(notFound),
      updateBooking: vi.fn().mockResolvedValue(notFound),
      updateStatus: vi.fn().mockResolvedValue({ status: 200, data: { bookingId: 'b-1', status: 'no_show' } })
    } as unknown as AdminBookingRepository);
    const items = await crud.getAll('br-1');
    const today: BookingRecord = { ...items[0], fecha: new Date(), estado: 'confirmado' };
    expect(items[0]).toMatchObject({ id: 'b-1', clienteId: 'c-1', estado: 'confirmado', hora: '10:00' });
    expect(crud.getByFecha(items, items[0].fecha)).toHaveLength(1);
    expect(crud.getHoy([today], new Date()).concat(crud.getAgendados([today]))).toHaveLength(2);
    expect(crud.delete(items, 'b-1')).toEqual([]);
    await expect(crud.cancelByAdmin('b-1', { performedBy: '  ', branchId: 'br-1' })).rejects.toThrow(/performedBy/);
    await expect(crud.update({ bookingId: 'b-1', performedBy: 'admin-1' })).rejects.toThrow(/TURNO_NOT_FOUND/);
    expect(await crud.markAsNoShow('b-1', 'admin-1')).toEqual({ bookingId: 'b-1', status: 'no_show' });
  });

  it('scheduling validates create and maps slot conflicts', async () => {
    const createManualBooking = vi.fn()
      .mockResolvedValueOnce({ status: 400, error: { code: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT' } })
      .mockResolvedValueOnce({ status: 201, data: { bookingId: 'b-1', status: 'confirmed' } });
    const svc = new BookingSchedulingService({
      createManualBooking,
      reschedule: vi.fn().mockResolvedValue({ status: 400, error: { code: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT' } }),
      updateBlockedTime: vi.fn().mockResolvedValue({ status: 201, data: { blockId: 'block-1' } })
    } as unknown as AdminBookingRepository);
    await expect(svc.create({ servicioId: 's-1', fecha: future, hora: '10:00', duracionMinutos: 30 }, ctx))
      .rejects.toThrow(/CLIENT_REQUIRED/);
    await expect(svc.create({ clienteId: 'c-1', servicioId: 's-1', fecha: future, hora: '10:00', duracionMinutos: 30 }, ctx))
      .rejects.toThrow(/SLOT_CONFLICT/);
    expect(await svc.create({ walkInName: 'Ada', servicioId: 's-1', fecha: future, hora: '11:00', duracionMinutos: 45 }, ctx))
      .toEqual({ bookingId: 'b-1', status: 'confirmed' });
    await expect(svc.rescheduleByAdmin('b-1', { fecha: future, hora: '14:00', performedBy: 'admin-1' }, ctx))
      .rejects.toThrow(/TURNO_SLOT_COLLISION/);
    await expect(svc.createBlockedTime({
      startsAtIso: '2099-01-15T13:00:00.000Z', endsAtIso: '2099-01-15T14:00:00.000Z', performedBy: ' '
    })).rejects.toThrow(/AUTH_REQUIRED/);
  });

  it('attaches RPC code and HTTP status on create failures instead of Spanish-only Errors', async () => {
    const svc = new BookingSchedulingService({
      createManualBooking: vi.fn()
        .mockResolvedValueOnce({
          status: 401,
          error: { code: 'UNAUTHORIZED', message: 'No se pudo crear el turno' }
        })
        .mockResolvedValueOnce({
          status: 400,
          error: { code: '42804', message: 'datatype mismatch' }
        })
        .mockResolvedValueOnce({
          status: 409,
          error: { code: 'SLOT_CONFLICT', message: 'SLOT_CONFLICT' }
        })
    } as unknown as AdminBookingRepository);

    await expect(
      svc.create({ clienteId: 'c-1', servicioId: 's-1', fecha: future, hora: '10:00', duracionMinutos: 30 }, ctx)
    ).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });

    await expect(
      svc.create({ clienteId: 'c-1', servicioId: 's-1', fecha: future, hora: '10:00', duracionMinutos: 30 }, ctx)
    ).rejects.toMatchObject({ code: '42804', status: 400 });

    await expect(
      svc.create({ clienteId: 'c-1', servicioId: 's-1', fecha: future, hora: '10:00', duracionMinutos: 30 }, ctx)
    ).rejects.toMatchObject({ code: 'SLOT_CONFLICT', status: 409 });
  });

  it('availability drops zero-capacity slots and fails closed on port errors', async () => {
    const req = { fecha: new Date('2026-08-17T00:00:00.000Z'), durationMinutes: 30, dateIso: '2026-08-17' };
    const ok = new BookingAvailabilityService({
      loadAvailabilityWindows: vi.fn().mockResolvedValue({
        status: 200,
        data: [
          { startsAtIso: '2026-08-17T13:00:00.000Z', endsAtIso: '2026-08-17T13:30:00.000Z', remainingCapacity: 1 },
          { startsAtIso: '2026-08-17T13:30:00.000Z', endsAtIso: '2026-08-17T14:00:00.000Z', remainingCapacity: 0 }
        ]
      })
    } as unknown as AdminBookingRepository);
    await expect(ok.loadAvailabilityAdminSlotTimes(req)).resolves.toEqual(['10:00']);
    const bad = new BookingAvailabilityService({
      loadAvailabilityWindows: vi.fn().mockResolvedValue({ status: 400, error: { code: 'VALIDATION_ERROR', message: 'ACTIVE_BRANCH_REQUIRED' } })
    } as unknown as AdminBookingRepository);
    await expect(bad.loadAvailabilityAdminSlotTimes(req)).rejects.toThrow(/ACTIVE_BRANCH_REQUIRED/);
  });

  it('notifications emit lifecycle events and sanitize telemetry codes', async () => {
    const emit = vi.fn().mockReturnValue({ status: 'sent' });
    const recordCancelFailure = vi.fn();
    const recordRescheduleFailure = vi.fn();
    const svc = new BookingNotificationsService({ recordCancelFailure, recordRescheduleFailure } as unknown as AdminBookingRepository);
    svc.attachNotificationService({ emit });
    svc.notifyBookingCreated('b-1', '2026-08-17T13:00:00.000Z');
    svc.notifyAdminAction('b-1', 'cancel', '2026-08-17T13:05:00.000Z');
    expect(emit).toHaveBeenCalledWith(expect.objectContaining({ eventKey: 'booking.created:b-1' }));
    await svc.recordAdminCancelFailureTelemetry({ stage: 'rpc', code: ' slot! ', status: 400, retryable: true });
    await svc.recordAdminRescheduleFailureTelemetry({
      stage: 'ui', code: svc.adminRescheduleTelemetryCode(new Error('TURNO_SLOT_COLLISION')), status: 409
    });
    expect(recordCancelFailure).toHaveBeenCalledWith({ stage: 'rpc', code: 'SLOT_', status: 400, retryable: true });
    expect(recordRescheduleFailure).toHaveBeenCalledWith({ stage: 'ui', code: 'SLOT_UNAVAILABLE', status: 409, retryable: true });
  });
});
