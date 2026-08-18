import { Injectable, inject, signal } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { BookingAvailabilityService, BookingCrudService, BookingNotificationsService, BookingSchedulingService, type BookingRecord } from '@orvel/booking/application';
import type { AdminAvailabilityRequest, AdminBlockedTimePayload } from '@orvel/booking/infrastructure';
import { AuthService } from '../../../services/auth.service';
import { getBranchContextService } from '../../../core/branches/branch-context.service';
import type { NotificationServicePort } from '../../../services/notification.service';
import type { CreateTurnoDTO, Turno, TurnoEstado, UpdateTurnoDTO } from '../models/turno.model';
export type { AdminAvailabilityRequest } from '@orvel/booking/infrastructure';
export type { AdminManualBookingPayload } from '@orvel/booking';
const toTurno = (row: BookingRecord): Turno => ({ ...row, clienteId: row.clienteId ?? '', servicioId: row.servicioId ?? '', precio: row.precio ?? 0 });
@Injectable({ providedIn: 'root' })
export class TurnoService {
  private readonly crud = inject(BookingCrudService, { optional: true });
  private readonly scheduling = inject(BookingSchedulingService, { optional: true });
  private readonly availability = inject(BookingAvailabilityService, { optional: true });
  private readonly notifications = inject(BookingNotificationsService, { optional: true });
  private readonly auth = inject(AuthService);
  private readonly branch = getBranchContextService();
  private readonly turnos = signal<Turno[]>([]);
  private readonly loading = signal(false);
  private readonly loadErrorState = signal<string | null>(null);
  readonly items = this.turnos.asReadonly();
  readonly isLoading = this.loading.asReadonly();
  readonly loadError = this.loadErrorState.asReadonly();
  private async scope() {
    const user = this.auth.user() as { id?: string; activeBranchId?: string } | null;
    const userId = String(user?.id ?? '').trim();
    const branchId = this.branch.getActiveBranchId() ?? user?.activeBranchId ?? '';
    if (!userId) throw new Error('AUTH_REQUIRED: No active tenant session');
    if (!branchId) throw new Error('ACTIVE_BRANCH_REQUIRED: Se requiere sucursal activa');
    return { userId, branchId, businessId: '', performedBy: userId };
  }
  getAll(): Observable<Turno[]> {
    this.loading.set(true); this.loadErrorState.set(null);
    return from(this.scope().then((s) => this.crud!.getAll(s.branchId).then((rows) => rows.map(toTurno)))).pipe(tap({
      next: (rows) => { this.turnos.set(rows); this.loading.set(false); },
      error: (err: Error) => {
        this.loadErrorState.set(/BRANCH|AUTH/i.test(err.message) ? 'No pudimos validar el alcance de sucursal. Reintentá antes de operar turnos.' : 'No pudimos cargar turnos. Reintentá antes de asumir que la agenda está vacía.');
        this.loading.set(false);
      }
    }));
  }
  getById(id: string) { return of(this.crud?.getById(this.turnos() as never, id) as Turno | undefined); }
  getByFecha(fecha: Date) { return of(this.crud?.getByFecha(this.turnos() as never, fecha) as Turno[]); }
  getByCliente(id: string) { return of(this.crud?.getByCliente(this.turnos() as never, id) as Turno[]); }
  getHoy() { return of(this.crud?.getHoy(this.turnos() as never) as Turno[]); }
  getAgendados() { return of(this.crud?.getAgendados(this.turnos() as never) as Turno[]); }
  delete(id: string) { this.turnos.set((this.crud?.delete(this.turnos() as never, id) ?? []) as Turno[]); return of(true); }
  create(dto: CreateTurnoDTO) {
    return from(this.scope().then((s) => this.scheduling!.create(dto, s).then((r) => toTurno({ ...dto, id: r.bookingId, createdAt: new Date(), updatedAt: new Date() } as BookingRecord))));
  }
  update(id: string, dto: UpdateTurnoDTO) {
    return from(this.scope().then((s) => this.crud!.update({ bookingId: id, performedBy: s.performedBy, notes: dto.notas }).then(() => ({ ...this.turnos().find((item) => item.id === id)!, ...dto }))));
  }
  updateEstado(id: string, estado: TurnoEstado) {
    return from(this.scope().then((s) => this.crud!.updateEstado(id, estado, s.performedBy).then(() => ({ ...this.turnos().find((item) => item.id === id)!, estado }))));
  }
  markAsNoShow(id: string) { return this.updateEstado(id, 'no-asistio'); }
  cancelByAdmin(id: string, payload: { performedBy: string; reason?: string; notes?: string }) {
    return from(this.scope().then((s) => this.crud!.cancelByAdmin(id, { ...payload, branchId: s.branchId }).then(() => this.turnos().find((item) => item.id === id)!)));
  }
  rescheduleByAdmin(id: string, payload: { fecha: Date; hora: string; performedBy: string; reason?: string }) {
    return from(this.scope().then((s) => this.scheduling!.rescheduleByAdmin(id, payload, s).then(() => ({ ...this.turnos().find((item) => item.id === id)!, ...payload }))));
  }
  createBlockedTime(payload: Omit<AdminBlockedTimePayload, 'businessId' | 'branchId'> & { businessId?: string | null; branchId?: string | null }) {
    return from(this.scope().then((s) => this.scheduling!.createBlockedTime({ ...payload, businessId: payload.businessId ?? s.businessId, branchId: payload.branchId ?? s.branchId })));
  }
  loadAvailabilityAdminSlotTimes(request: AdminAvailabilityRequest) { return this.availability!.loadAvailabilityAdminSlotTimes(request); }
  getHorariosDisponibles(_fecha: Date, _mins: number): string[] { return []; }
  invalidateAdminAvailability(): void { /* cache lives in BookingAvailabilityService */ }
  attachNotificationService(port: NotificationServicePort) { this.notifications?.attachNotificationService(port); }
  setProvider(_provider: 'mock' | 'supabase'): void { /* tests should inject fakes */ }
  getActiveBranchId(): string | null { return this.branch.getActiveBranchId(); }
  ensureInternalDefaultBranchId() { return this.scope().then((s) => s.branchId); }
  ensureDefaultBranchId() { return this.ensureInternalDefaultBranchId(); }
  recordAdminCancelFailureTelemetry(input: { stage: 'rpc' | 'ui'; code: unknown; status?: unknown; retryable?: boolean }) { return this.notifications!.recordAdminCancelFailureTelemetry(input as never); }
  recordAdminRescheduleFailureTelemetry(input: { stage: 'rpc' | 'ui'; code: unknown; status?: unknown; retryable?: boolean }) { return this.notifications!.recordAdminRescheduleFailureTelemetry(input as never); }
}
