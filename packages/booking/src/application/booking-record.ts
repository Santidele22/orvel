export const TIMEZONE = 'America/Argentina/Buenos_Aires';
export const TURNO_NOT_FOUND_MESSAGE = 'TURNO_NOT_FOUND: Turno no encontrado';
export const ADMIN_INVALID_TRANSITION_CODE = ['TURNO', 'INVALID', 'STATUS', 'TRANSITION'].join('_');
export type BookingEstado = 'pendiente' | 'confirmado' | 'en-proceso' | 'completado' | 'cancelado' | 'no-asistio';
export type BookingDepositStatus = 'none' | 'pending' | 'paid' | 'claim_pending' | 'released' | 'abandoned' | 'void';
export type BookingRecord = {
  id: string; branchId?: string; clienteId?: string; servicioId?: string;
  fecha: Date; hora: string; duracionMinutos: number; estado: BookingEstado;
  depositStatus?: BookingDepositStatus;
  notas?: string; precio?: number; professionalId?: string; professionalNombre?: string;
  createdAt: Date; updatedAt: Date;
};

export function isDepositUnpaid(status?: string | null): boolean {
  return status === 'pending' || status === 'claim_pending';
}

export function appointmentStatusLabel(estado: BookingEstado, depositStatus?: string | null): string {
  if (isDepositUnpaid(depositStatus) && (estado === 'confirmado' || estado === 'pendiente')) {
    return 'Pendiente de seña';
  }
  return estado;
}
export const TO_DB_STATUS: Record<BookingEstado, string> = {
  pendiente: 'pending', confirmado: 'booked', 'en-proceso': 'in_progress', completado: 'completed',
  cancelado: 'cancelled', 'no-asistio': 'no_show'
};
export const FROM_DB_STATUS: Record<string, BookingEstado> = {
  booked: 'confirmado', confirmed: 'confirmado', pending: 'pendiente', in_progress: 'en-proceso',
  completed: 'completado', cancelled: 'cancelado', no_show: 'no-asistio'
};

export function toArgentinaTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE });
}
export function toArgentinaDate(date: Date): Date {
  const [year, month, day] = date.toLocaleDateString('en-CA', { timeZone: TIMEZONE }).split('-').map(Number);
  return new Date(year, month - 1, day);
}
export function toDateKey(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}
export function toStartsAtIso(fecha: Date, hora: string): string {
  const start = new Date(fecha);
  const [hours, minutes] = hora.split(':').map(Number);
  start.setHours(hours, minutes, 0, 0);
  return start.toISOString();
}
export function mapAdminMutationError(message: string, fallback: string): Error {
  if (message.includes('TURNO_NOT_FOUND')) return new Error(TURNO_NOT_FOUND_MESSAGE);
  if (message.includes(ADMIN_INVALID_TRANSITION_CODE)) return new Error(ADMIN_INVALID_TRANSITION_CODE);
  if (message.includes('SLOT_CONFLICT') || message.includes('conflict')) return new Error('TURNO_SLOT_COLLISION');
  return new Error(message || fallback);
}
export function mapBookingRow(booking: Record<string, unknown>, branchId: string): BookingRecord {
  const startsAt = new Date(String(booking['starts_at']));
  const endsAt = new Date(String(booking['ends_at']));
  const created = String(booking['created_at'] || booking['createdAt'] || new Date().toISOString());
  return {
    id: String(booking['id']), branchId: String(booking['branch_id'] ?? branchId),
    clienteId: booking['customer_id'] as string | undefined, servicioId: booking['service_id'] as string | undefined,
    fecha: toArgentinaDate(startsAt), hora: toArgentinaTime(startsAt),
    duracionMinutos: Math.round((endsAt.getTime() - startsAt.getTime()) / 60000),
    estado: FROM_DB_STATUS[String(booking['status'])] || 'confirmado',
    depositStatus: (String(booking['deposit_status'] ?? booking['depositStatus'] ?? 'none') || 'none') as BookingRecord['depositStatus'],
    notas: booking['notes'] as string | undefined, precio: 0,
    professionalId: booking['professional_id'] ? String(booking['professional_id']) : undefined,
    professionalNombre: booking['professional_name'] ? String(booking['professional_name']) : undefined,
    createdAt: new Date(created), updatedAt: new Date(String(booking['updated_at'] || booking['updatedAt'] || created))
  };
}
