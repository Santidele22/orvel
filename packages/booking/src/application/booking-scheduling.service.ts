import type { AdminBookingMutationResult, AdminBookingRepository } from './ports/admin-booking.repository';
import type { AdminBlockedTimePayload, AdminManualBookingPayload } from '../types';
import { mapAdminMutationError, toStartsAtIso } from './booking-record';

export type CreateBookingInput = {
  clienteId?: string; walkInName?: string; servicioId: string; fecha: Date; hora: string;
  duracionMinutos: number; notas?: string; branchId?: string; precio?: number; professionalId?: string;
};
export type SchedulingContext = { businessId: string; branchId: string; performedBy: string };
export type AdminRescheduleInput = { fecha: Date; hora: string; performedBy: string; reason?: string };

export class BookingSchedulingService {
  constructor(private readonly adminRepo: AdminBookingRepository) {}

  async create(dto: CreateBookingInput, context: SchedulingContext): Promise<AdminBookingMutationResult> {
    this.assertCreatePayload(dto);
    const payload: AdminManualBookingPayload = {
      businessId: context.businessId, branchId: dto.branchId?.trim() || context.branchId,
      serviceId: dto.servicioId, startsAtIso: toStartsAtIso(dto.fecha, dto.hora),
      durationMinutes: dto.duracionMinutos, clientId: dto.clienteId || undefined,
      walkInName: dto.clienteId ? undefined : dto.walkInName?.trim(),
      professionalId: dto.professionalId || undefined,
      performedBy: context.performedBy, notes: dto.notas
    };
    const response = await this.adminRepo.createManualBooking(payload);
    if (response.error) throw this.mapCreateError(response.error.code, response.error.message, response.status);
    if (!response.data) throw new Error('Error al crear turno: no se recibió respuesta');
    return response.data;
  }

  async rescheduleByAdmin(id: string, payload: AdminRescheduleInput, context: SchedulingContext): Promise<AdminBookingMutationResult> {
    const response = await this.adminRepo.reschedule({
      bookingId: id, branchId: context.branchId, performedBy: payload.performedBy || context.performedBy,
      notes: payload.reason, reason: payload.reason, startsAtIso: toStartsAtIso(payload.fecha, payload.hora)
    });
    if (response.error) throw mapAdminMutationError(response.error.message, 'Error al reprogramar turno');
    if (!response.data) throw new Error('Error al reprogramar turno: no se recibió respuesta');
    return response.data;
  }

  async createBlockedTime(
    payload: Omit<AdminBlockedTimePayload, 'businessId' | 'branchId'> & { businessId?: string | null; branchId?: string | null }
  ): Promise<{ blockId: string }> {
    if (!payload.performedBy?.trim()) throw new Error('AUTH_REQUIRED: No se pudo identificar el administrador');
    if (!payload.branchId?.trim() || !payload.businessId?.trim()) {
      throw new Error('ACTIVE_BRANCH_REQUIRED: Se requiere sucursal activa para bloquear horarios');
    }
    const response = await this.adminRepo.updateBlockedTime({
      businessId: payload.businessId, branchId: payload.branchId, startsAtIso: payload.startsAtIso,
      endsAtIso: payload.endsAtIso, reason: payload.reason, performedBy: payload.performedBy
    });
    if (response.error) throw new Error(response.error.message || 'Error al crear bloqueo de tiempo');
    if (!response.data) throw new Error('Error al crear bloqueo de tiempo: no se recibió respuesta');
    return response.data;
  }

  private assertCreatePayload(dto: CreateBookingInput): void {
    if (!dto.clienteId?.trim() && !dto.walkInName?.trim()) throw new Error('CLIENT_REQUIRED: Seleccioná un cliente o ingresá nombre walk-in');
    if (!dto.servicioId?.trim()) throw new Error('servicioId es requerido');
    if (!dto.fecha || Number.isNaN(dto.fecha.getTime())) throw new Error('fecha inválida');
    if (!dto.hora?.trim()) throw new Error('hora es requerido');
    if (!dto.duracionMinutos || dto.duracionMinutos <= 0) throw new Error('duracionMinutos debe ser mayor a 0');
    const appointmentDay = new Date(dto.fecha.getFullYear(), dto.fecha.getMonth(), dto.fecha.getDate());
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (appointmentDay < today) throw new Error('No se puede agendar en fecha pasada');
  }

  private mapCreateError(code: string, message: string, status?: number): Error {
    let error: Error;
    if (code === 'SLOT_CONFLICT') error = new Error('SLOT_CONFLICT: El horario solicitado no está disponible');
    else if (code === 'BLOCKED_TIME_COLLISION') error = new Error('BLOCKED_TIME_COLLISION: El horario está bloqueado');
    else if (code === 'VALIDATION_ERROR') error = new Error(`VALIDATION_ERROR: ${message}`);
    else if (code === 'BUSINESS_NOT_FOUND') error = new Error('BUSINESS_NOT_FOUND: Negocio no encontrado');
    else error = new Error(message || 'Error al crear turno');

    Object.assign(error, { code, ...(typeof status === 'number' ? { status } : {}) });
    return error;
  }
}
