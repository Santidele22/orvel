import type { AdminBookingMutationResult, AdminBookingRepository } from './ports/admin-booking.repository';
import type { AdminUpdateBookingPayload } from '../types';
import { type BookingEstado, type BookingRecord, TO_DB_STATUS, mapAdminMutationError, mapBookingRow, toDateKey } from './booking-record';

export class BookingCrudService {
  constructor(private readonly adminRepo: AdminBookingRepository) {}

  async getAll(branchId: string): Promise<BookingRecord[]> {
    const { data, error } = await this.adminRepo.listBookings(branchId);
    if (error) throw new Error('BOOKINGS_LOAD_FAILED: No pudimos cargar turnos desde Supabase');
    return ((data ?? []) as Record<string, unknown>[]).map((row) => mapBookingRow(row, branchId));
  }

  getById(items: BookingRecord[], id: string): BookingRecord | undefined { return items.find((item) => item.id === id); }
  getByFecha(items: BookingRecord[], fecha: Date): BookingRecord[] {
    const key = toDateKey(fecha);
    return items.filter((item) => toDateKey(item.fecha) === key);
  }
  getByCliente(items: BookingRecord[], clienteId: string): BookingRecord[] {
    return items.filter((item) => item.clienteId === clienteId);
  }
  getHoy(items: BookingRecord[], today: Date = new Date()): BookingRecord[] { return this.getByFecha(items, today); }
  getAgendados(items: BookingRecord[]): BookingRecord[] {
    return items.filter((item) => item.estado === 'confirmado' || item.estado === 'en-proceso');
  }
  delete(items: BookingRecord[], id: string): BookingRecord[] { return items.filter((item) => item.id !== id); }

  async update(payload: AdminUpdateBookingPayload): Promise<AdminBookingMutationResult> {
    const response = await this.adminRepo.updateBooking(payload);
    if (response.error) throw mapAdminMutationError(response.error.message, 'Error al actualizar turno');
    if (!response.data) throw new Error('Error al actualizar turno: no se recibió respuesta');
    return response.data;
  }

  async updateEstado(id: string, estado: BookingEstado, performedBy: string): Promise<AdminBookingMutationResult> {
    const response = await this.adminRepo.updateStatus({ bookingId: id, status: TO_DB_STATUS[estado], performedBy });
    if (response.error) {
      if (response.error.message.includes('same') || response.error.message.includes('already')) {
        return { bookingId: id, status: TO_DB_STATUS[estado] };
      }
      throw mapAdminMutationError(response.error.message, 'Error al actualizar estado');
    }
    if (!response.data) throw new Error('Error al actualizar estado: no se recibió respuesta');
    return response.data;
  }

  markAsNoShow(id: string, performedBy: string): Promise<AdminBookingMutationResult> {
    return this.updateEstado(id, 'no-asistio', performedBy);
  }

  async cancelByAdmin(
    id: string,
    payload: { performedBy: string; reason?: string; notes?: string; branchId: string }
  ): Promise<AdminBookingMutationResult> {
    if (!payload.performedBy?.trim()) throw new Error('performedBy es requerido para cancelar');
    const response = await this.adminRepo.cancel({
      bookingId: id, branchId: payload.branchId, performedBy: payload.performedBy,
      notes: payload.reason ?? payload.notes, reason: payload.reason
    });
    if (response.error) throw mapAdminMutationError(response.error.message, 'Error al cancelar turno');
    if (!response.data) throw new Error('Error al cancelar turno: no se recibió respuesta');
    return response.data;
  }
}
