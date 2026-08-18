import type { AdminAvailabilityRequest, AdminBookingRepository, AdminSlotAvailabilityRow } from './ports/admin-booking.repository';
import { toArgentinaTime } from './booking-record';

export class BookingAvailabilityService {
  constructor(private readonly adminRepo: AdminBookingRepository) {}

  async loadAvailabilityAdminSlotTimes(request: AdminAvailabilityRequest): Promise<string[]> {
    const response = await this.adminRepo.loadAvailabilityWindows(request);
    if (response.error) throw new Error(response.error.message || 'Error al cargar disponibilidad');
    return this.getHorariosDisponibles(response.data ?? []);
  }

  getHorariosDisponibles(slots: AdminSlotAvailabilityRow[]): string[] {
    return slots
      .filter((slot) => slot.remainingCapacity > 0)
      .map((slot) => toArgentinaTime(new Date(slot.startsAtIso)));
  }

  adminAvailabilityCacheKey(request: AdminAvailabilityRequest): string {
    return [
      request.dateIso ?? request.fecha.toISOString().slice(0, 10),
      request.durationMinutes,
      request.serviceId ?? '',
      request.branchId ?? '',
      request.context ?? 'admin-create',
      request.bookingId ?? ''
    ].join('|');
  }
}
