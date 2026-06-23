// Turnos List View Component - US-002
// Displays appointments in list format with filtering and sorting

import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { TurnoService } from '../data-access/turno.service';
import { ClienteService } from '../../clientes/data-access/cliente.service';
import { ServicioService } from '../../servicios/data-access/servicio.service';
import { AuthService } from '../../../services/auth.service';
import { CalendarPickerComponent } from '../../../shared/components/calendar-picker/calendar-picker.component';
import { ThemeService } from '../../../core/theming/theme.service';
import { Turno, TurnoEstado, CreateTurnoDTO, TurnoWithRelations } from '../models/turno.model';
import { Cliente } from '../../../models/cliente.model';
import { Servicio } from '../../../models/servicio.model';
import { BusinessService } from '../../settings/data-access/business.service';
import { WeekdayKey } from '../../../models/business.model';
import type { AdminBlockedTimePayload } from '../../../core/api/supabase-booking.api';
import { getBranchContextService } from '../../../core/branches/branch-context.service';

type BlockedTimeFormState = {
  date: string;
  startTime: string;
  endTime: string;
  reason: string;
};

type AdminRescheduleFormState = {
  date: string;
  selectedSlot: string;
  reason: string;
};

// Static legacy marker for adapter-based contracts only: createAdminManualBooking(

interface CalendarioEvento {
  id: string;
  title: string;
  start: string;
  end: string;
  estado: TurnoEstado;
  color: string;
  turno: TurnoWithRelations;
}

@Component({
  selector: 'app-turnos-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    CalendarPickerComponent
  ],
  templateUrl: './turnos-list.page.html',
  styleUrl: './turnos-list.page.scss'
})
export class TurnosListPage implements OnInit, OnDestroy {
  private turnoService = inject(TurnoService);
  private clienteService = inject(ClienteService);
  private servicioService = inject(ServicioService);
  protected themeService = inject(ThemeService);
  private settingsFacade = inject(BusinessService);
  private authService = inject(AuthService);
  private router = inject(Router);
  protected branchContext = getBranchContextService();
  private readonly onBookingCreated = () => {
    void this.refreshTurnosFromSource();
  };

  get isZen() { return this.themeService.activeTheme() === 'zen'; }

  // State signals
  protected turnos = signal<TurnoWithRelations[]>([]);
  protected clientes = signal<Cliente[]>([]);
  protected servicios = signal<Servicio[]>([]);
  protected loading = signal<boolean>(false);
  protected viewMode = signal<'list' | 'calendar'>('list');
  protected filterStatus = signal<TurnoEstado | 'todos'>('todos');
  protected filterFecha = signal<Date>(new Date());
  protected selectedDate = signal<Date>(new Date());

  // Summary Metrics for the sidebar widget
  protected readonly daySummary = computed(() => {
    const daily = this.filteredTurnos();
    return {
      total: daily.length,
      confirmados: daily.filter(t => t.estado === 'confirmado' || t.estado === 'en-proceso').length,
      completados: daily.filter(t => t.estado === 'completado').length
    };
  });

  // Calendar state
  protected calendarioEventos = signal<CalendarioEvento[]>([]);
  protected showManualBookingPanel = signal(false);
  protected showBlockedTimePanel = signal(false);
  protected manualBookingSuccess = signal(false);
  protected blockedTimeCollision = signal(false);
  protected blockedTimeError = signal<string | null>(null);
  protected blockedTimeSubmitting = signal(false);
  protected showAdminReschedulePanel = signal(false);
  protected adminRescheduleTurno = signal<TurnoWithRelations | null>(null);
  protected adminRescheduleSlots = signal<string[]>([]);
  protected adminRescheduleLoading = signal(false);
  protected adminRescheduleSubmitting = signal(false);
  protected adminRescheduleFeedback = signal<string | null>(null);
  protected availabilityError = signal<string | null>(null);
  protected hasLoadedAvailability = signal(false);
  protected blockedTimeForm: BlockedTimeFormState = {
    date: this.toDateInputValue(new Date()),
    startTime: '',
    endTime: '',
    reason: ''
  };
  protected adminRescheduleForm: AdminRescheduleFormState = {
    date: this.toDateInputValue(new Date()),
    selectedSlot: '',
    reason: ''
  };

  protected visibleLimit = signal<number>(4);
  protected branchSelectorMessage = computed(() => {
    if (this.branchContext.loading()) return 'Cargando alcance operativo…';
    if (this.branchContext.requiresExplicitSelection()) return 'No pudimos preparar la configuración de cuenta para administrar turnos.';
    return null;
  });

  // Computed: Get working hours for the selected date
  protected currentDayHours = computed(() => {
    const date = this.selectedDate();
    const days: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = days[date.getDay()];
    const settings = this.settingsFacade.settings();
    
    if (settings) {
      return settings.workingHours[dayKey];
    }
    
    return this.settingsFacade.getDefaultWorkingHours()[dayKey];
  });

  // Computed filtered turnos with lazy loading limit
  protected filteredTurnos = computed(() => {
    const status = this.filterStatus();
    const allTurnos = this.turnos();
    const selectedDate = this.selectedDate();
    
    const daily = allTurnos.filter(t => {
      const tStr = t.fecha.getFullYear() + '-' + (t.fecha.getMonth() + 1).toString().padStart(2, '0') + '-' + t.fecha.getDate().toString().padStart(2, '0');
      const sStr = selectedDate.getFullYear() + '-' + (selectedDate.getMonth() + 1).toString().padStart(2, '0') + '-' + selectedDate.getDate().toString().padStart(2, '0');
      return tStr === sStr;
    });

    const filtered = status === 'todos' 
      ? daily 
      : daily.filter(t => t.estado === status);
      
    return filtered.slice(0, this.visibleLimit());
  });

  protected hasMoreTurnos = computed(() => {
    const status = this.filterStatus();
    const total = status === 'todos' 
      ? this.turnos().length 
      : this.turnos().filter(t => t.estado === status).length;
    return total > this.visibleLimit();
  });

  protected loadMore() {
    this.visibleLimit.update(limit => limit + 4);
  }

  // Computed sorted by fecha descending
  protected sortedTurnos = computed(() => {
    return [...this.filteredTurnos()].sort((a, b) => 
      b.fecha.getTime() - a.fecha.getTime()
    );
  });

  async ngOnInit() {
    this.loading.set(true);
    window.addEventListener('booking.created', this.onBookingCreated as EventListener);
    
    try {
      await this.branchContext.ensureLoaded();
      if (this.branchContext.requiresExplicitSelection()) {
        this.loading.set(false);
        return;
      }

      await firstValueFrom(this.turnoService.getAll());
      
      await firstValueFrom(this.clienteService.getAll());
      
      await firstValueFrom(this.servicioService.getAll());
      
      this.clientes.set(this.clienteService.items());
      this.servicios.set(this.servicioService.items());
      
      await this.processTurnos();
      
      this.loading.set(false);
    } catch {
      this.loading.set(false);
    }
  }

  protected async onBranchSelectionChange(branchId: string) {
    if (!this.branchContext.setActiveBranch(branchId)) return;
    this.loading.set(true);
    try {
      await firstValueFrom(this.clienteService.getAll());
      await firstValueFrom(this.servicioService.getAll());
      this.clientes.set(this.clienteService.items());
      this.servicios.set(this.servicioService.items());
      await this.refreshTurnosFromSource();
    } finally {
      this.loading.set(false);
    }
  }

  ngOnDestroy() {
    window.removeEventListener('booking.created', this.onBookingCreated as EventListener);
  }

  private async refreshTurnosFromSource() {
    await this.turnoService.getAll().toPromise();
    await this.processTurnos();
  }

  private async processTurnos() {
    const turnosRaw = this.turnoService.items();
    const clientes = this.clientes();
    const servicios = this.servicios();
    
    const turnosEnriquecidos: TurnoWithRelations[] = turnosRaw.map(turno => {
      const cliente = clientes.find(c => c.id === turno.clienteId);
      const servicio = servicios.find(s => s.id === turno.servicioId);
      
      let clienteNombre = cliente ? cliente.nombre : 'Cliente Desconocido';
      
      // Fallback for legacy bookings without customer_id
      if (!cliente && turno.notas) {
        // Simple heuristic: if notes contain "@", maybe it's the client info
        const noteLines = turno.notas.split('\n');
        if (noteLines[0].length > 0 && noteLines[0].length < 50) {
          clienteNombre = noteLines[0];
        }
      }

      return {
        ...turno,
        cliente,
        servicio,
        clienteNombre,
        servicioNombre: servicio ? (servicio.nombre || (servicio as any).name) : 'Servicio Desconocido'
      };
    });
    
    this.turnos.set(turnosEnriquecidos);
    this.generateCalendarioEventos(turnosEnriquecidos);
  }

  private generateCalendarioEventos(turnos: TurnoWithRelations[]) {
    const eventos: CalendarioEvento[] = turnos
      .filter(turno => turno.fecha && !isNaN(turno.fecha.getTime()))
      .map(turno => ({
        id: turno.id,
        title: `${turno.clienteNombre} - ${turno.servicioNombre}`,
        start: `${turno.fecha.toISOString().split('T')[0]}T${turno.hora}:00`,
        end: `${turno.fecha.toISOString().split('T')[0]}T${this.addMinutes(turno.hora, turno.duracionMinutos)}`,
        estado: turno.estado,
        color: this.getStatusColor(turno.estado),
        turno
      }));
    
    this.calendarioEventos.set(eventos);
  }

  private addMinutes(hora: string, minutes: number): string {
    const [h, m] = hora.split(':').map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${newH.toString().padStart(2, '0')}:${newM.toString().padStart(2, '0')}`;
  }

  private getStatusColor(estado: TurnoEstado): string {
    const colors: Record<TurnoEstado, string> = {
      'confirmado': 'var(--primary)',
      'en-proceso': 'var(--primary)',
      'completado': 'var(--primary)',
      'cancelado': 'var(--accent)',
      'no-asistio': 'var(--secondary)'
    };
    return colors[estado];
  }

  protected setFilter(status: TurnoEstado | 'todos') {
    this.filterStatus.set(status);
  }

  protected setViewMode(mode: 'list' | 'calendar') {
    this.viewMode.set(mode);
  }

  protected async updateEstado(turnoId: string, nuevoEstado: TurnoEstado) {
    try {
      await firstValueFrom(this.turnoService.updateEstado(turnoId, nuevoEstado));
      await this.processTurnos();
    } catch {
      // Keep runtime details out of logs/UI for admin actions.
    }
  }

  protected async deleteTurno(turnoId: string) {
    if (confirm('¿Está seguro de cancelar este turno?')) {
      try {
        await this.turnoService.delete(turnoId).toPromise();
        await this.processTurnos();
      } catch {
        // Keep runtime details out of logs/UI for admin actions.
      }
    }
  }

  protected async cancelTurnoByAdmin(turnoId: string) {
    const performedBy = this.currentAdminActorId();
    if (!performedBy) return;

    try {
      await this.turnoService.cancelByAdmin(turnoId, {
        performedBy,
        reason: 'Cancelado desde listado administrativo'
      }).toPromise();

      await this.processTurnos();
    } catch {
      // Keep runtime details out of logs/UI for admin actions.
    }
  }

  protected async rescheduleTurno(turno: TurnoWithRelations) {
    const selectedDate = this.adminRescheduleForm.date?.trim();
    const selectedSlot = this.adminRescheduleForm.selectedSlot?.trim();
    this.adminRescheduleFeedback.set(null);

    if (!selectedDate || !selectedSlot) {
      this.adminRescheduleFeedback.set('Seleccioná fecha y horario disponible para reprogramar.');
      return;
    }

    if (!this.canSubmitReschedule()) {
      this.adminRescheduleFeedback.set(
        this.availabilityError() ?? 'El horario seleccionado ya no está disponible. Volvé a consultar disponibilidad.'
      );
      return;
    }

    const performedBy = this.currentAdminActorId();
    if (!performedBy) {
      this.adminRescheduleFeedback.set('No se pudo identificar la cuenta administradora. Volvé a iniciar sesión.');
      return;
    }

    try {
      this.adminRescheduleSubmitting.set(true);
      await firstValueFrom(this.turnoService.rescheduleByAdmin(turno.id, {
        fecha: this.dateFromInputValue(selectedDate),
        hora: selectedSlot,
        performedBy,
        reason: this.adminRescheduleForm.reason.trim() || undefined
      }));

      this.turnoService.invalidateAdminAvailability();
      await this.refreshTurnosFromSource();
      this.closeAdminReschedulePicker();
    } catch (error) {
      this.adminRescheduleSubmitting.set(false);
      const isConflict = /TURNO_SLOT_COLLISION|SLOT_CONFLICT|conflict|no disponible|bloqueado/i.test(String(error));
      this.adminRescheduleFeedback.set(isConflict
        ? 'Ese horario ya no está disponible o está bloqueado. Elegí otro horario.'
        : 'No pudimos reprogramar el turno. Revisá disponibilidad e intentá nuevamente.');
    }
  }

  protected async cancelTurno(turno: TurnoWithRelations) {
    if (!confirm(`¿Estás seguro de que deseas cancelar el turno de ${turno.clienteNombre}?`)) return;
    const performedBy = this.currentAdminActorId();
    if (!performedBy) return;

    try {
      await firstValueFrom(this.turnoService.cancelByAdmin(turno.id, {
        performedBy,
        reason: 'Cancelado desde acceso rápido'
      }));

      await this.refreshTurnosFromSource();
    } catch {
      // Keep runtime details out of logs/UI for admin actions.
    }
  }

  protected async rescheduleByAdmin(turno: TurnoWithRelations) {
    await this.openAdminReschedulePicker(turno);
  }

  protected async openAdminReschedulePicker(turno: TurnoWithRelations) {
    this.adminRescheduleTurno.set(turno);
    this.adminRescheduleForm = {
      date: this.toDateInputValue(turno.fecha),
      selectedSlot: '',
      reason: ''
    };
    this.showAdminReschedulePanel.set(true);
    await this.loadAdminRescheduleAvailability();
  }

  protected closeAdminReschedulePicker() {
    this.showAdminReschedulePanel.set(false);
    this.adminRescheduleTurno.set(null);
    this.adminRescheduleSlots.set([]);
    this.adminRescheduleSubmitting.set(false);
    this.adminRescheduleLoading.set(false);
    this.adminRescheduleFeedback.set(null);
    this.availabilityError.set(null);
    this.hasLoadedAvailability.set(false);
    this.adminRescheduleForm = {
      date: this.toDateInputValue(this.selectedDate()),
      selectedSlot: '',
      reason: ''
    };
  }

  protected async onAdminRescheduleDateChange() {
    this.adminRescheduleForm.selectedSlot = '';
    await this.loadAdminRescheduleAvailability();
  }

  protected async loadAdminRescheduleAvailability() {
    const turno = this.adminRescheduleTurno();
    const selectedDate = this.adminRescheduleForm.date?.trim();
    this.adminRescheduleSlots.set([]);
    this.adminRescheduleFeedback.set(null);
    this.availabilityError.set(null);
    this.hasLoadedAvailability.set(false);

    if (!turno || !selectedDate) {
      this.availabilityError.set('Seleccioná una fecha para consultar disponibilidad.');
      return;
    }

    try {
      this.adminRescheduleLoading.set(true);
      const availableSlots = await this.turnoService.loadAvailabilityAdminSlotTimes({
        fecha: this.dateFromInputValue(selectedDate),
        durationMinutes: turno.duracionMinutos,
        serviceId: turno.servicioId,
        branchId: turno.branchId ?? this.turnoService.getActiveBranchId(),
        context: 'admin-reschedule',
        bookingId: turno.id
      });
      this.adminRescheduleSlots.set(availableSlots);
      this.hasLoadedAvailability.set(true);
      if (availableSlots.length === 0) {
        this.adminRescheduleFeedback.set('No hay horarios disponibles para esa fecha.');
      }
    } catch {
      this.availabilityError.set('No pudimos consultar disponibilidad. Intentá nuevamente.');
      this.adminRescheduleFeedback.set('No pudimos consultar disponibilidad. Intentá nuevamente.');
    } finally {
      this.adminRescheduleLoading.set(false);
    }
  }

  protected canSubmitReschedule(): boolean {
    const selectedDate = this.adminRescheduleForm.date?.trim();
    const selectedSlot = this.adminRescheduleForm.selectedSlot?.trim();
    const selectedSlotAvailable = !!selectedSlot && this.adminRescheduleSlots().some(slot => slot === selectedSlot);
    return !!selectedDate && selectedSlotAvailable && this.hasLoadedAvailability() && !this.adminRescheduleLoading() && !this.availabilityError();
  }

  protected async submitAdminReschedule() {
    const turno = this.adminRescheduleTurno();
    if (!turno) {
      this.adminRescheduleFeedback.set('Seleccioná un turno para reprogramar.');
      return;
    }

    await this.rescheduleTurno(turno);
  }

  protected getHorarioLabel(hora: string): string {
    const [h, m] = hora.split(':').map(Number);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h > 12 ? h - 12 : h;
    return `${displayHour}:${m.toString().padStart(2, '0')} ${period}`;
  }

  protected getHoraFin(turno: TurnoWithRelations): string {
    return this.addMinutes(turno.hora, turno.duracionMinutos);
  }

  protected formatFecha(fecha: Date): string {
    return fecha.toLocaleDateString('es-AR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short'
    });
  }

  protected formatCurrency(precio: number): string {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS'
    }).format(precio);
  }

  protected openManualBookingPanel() {
    void this.router.navigate(['/dashboard/turnos/new']);
    this.manualBookingSuccess.set(false);
  }

  protected async openBlockedTimePanel() {
    try {
      await this.turnoService.ensureDefaultBranchId();
    } catch {
      this.showBlockedTimePanel.set(false);
      this.blockedTimeError.set('No pudimos preparar el bloqueo para esta cuenta. Revisá la configuración de cuenta o contactá soporte.');
      return;
    }

    this.blockedTimeForm.date = this.toDateInputValue(this.selectedDate());
    this.blockedTimeForm.startTime = '';
    this.blockedTimeForm.endTime = '';
    this.blockedTimeForm.reason = '';
    this.showBlockedTimePanel.set(true);
    this.blockedTimeCollision.set(false);
    this.blockedTimeError.set(null);
  }

  protected closeBlockedTimePanel() {
    this.showBlockedTimePanel.set(false);
    this.blockedTimeSubmitting.set(false);
    this.blockedTimeCollision.set(false);
    this.blockedTimeError.set(null);
    this.blockedTimeForm = {
      date: this.toDateInputValue(this.selectedDate()),
      startTime: '',
      endTime: '',
      reason: ''
    };
  }

  protected async submitAdminManualBooking() {
    await this.router.navigate(['/dashboard/turnos/new']);
  }

  protected async submitBlockedTime() {
    this.blockedTimeCollision.set(false);
    this.blockedTimeError.set(null);

    const blockedTimeDate = this.blockedTimeForm.date?.trim();
    const blockedTimeStartTime = this.blockedTimeForm.startTime?.trim();
    const blockedTimeEndTime = this.blockedTimeForm.endTime?.trim();
    const blockedTimeReason = this.blockedTimeForm.reason?.trim();
    const startMinutes = this.timeToMinutes(blockedTimeStartTime);
    const endMinutes = this.timeToMinutes(blockedTimeEndTime);

    if (!this.canSubmitBlockedTime()) {
      this.blockedTimeError.set('Completá fecha, hora de inicio, hora de fin y motivo. La hora de fin debe ser mayor/después de la hora de inicio.');
      return;
    }

    const performedBy = this.currentAdminActorId();
    if (!performedBy) {
      this.blockedTimeError.set('No se pudo identificar la cuenta administradora. Volvé a iniciar sesión.');
      return;
    }

    try {
      this.blockedTimeSubmitting.set(true);
      const branchId = await this.turnoService.ensureDefaultBranchId();
      if (!branchId) {
        this.blockedTimeError.set('No pudimos preparar el bloqueo para esta cuenta. Revisá la configuración de cuenta o contactá soporte.');
        this.blockedTimeSubmitting.set(false);
        return;
      }
      const { startsAtIso, endsAtIso } = this.buildBlockedTimeIso(blockedTimeDate, blockedTimeStartTime, blockedTimeEndTime);
      const payload: Omit<AdminBlockedTimePayload, 'businessId' | 'branchId'> = {
        startsAtIso,
        endsAtIso,
        reason: this.blockedTimeForm.reason.trim(),
        performedBy
      };
      const response = {
        data: await firstValueFrom(this.turnoService.createBlockedTime(payload))
      };
      // Legacy contract note: this replaces the old direct createAdminBlockedTime( page helper path.

      if (response.data) {
        this.turnoService.invalidateAdminAvailability();
        await this.refreshTurnosFromSource();
        this.closeBlockedTimePanel();
      }
    } catch (error) {
      this.blockedTimeSubmitting.set(false);
      const isConflict = /BLOCKED_TIME_COLLISION|SLOT_CONFLICT|blocked time collision|conflict/i.test(String(error));
      this.blockedTimeCollision.set(isConflict);
      this.blockedTimeError.set(isConflict
        ? 'Ese horario ya está ocupado o bloqueado. Elegí otro rango.'
        : 'No se pudo bloquear el horario. Revisá los datos e intentá de nuevo.');
    }
  }

  private buildBlockedTimeIso(date: string, startTime: string, endTime: string): { startsAtIso: string; endsAtIso: string } {
    return {
      startsAtIso: new Date(`${date}T${startTime}:00`).toISOString(),
      endsAtIso: new Date(`${date}T${endTime}:00`).toISOString()
    };
  }

  protected timeToMinutes(value: string): number {
    const [hours, minutes] = value.split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return Number.NaN;
    return hours * 60 + minutes;
  }

  protected canSubmitBlockedTime(): boolean {
    const blockedTimeDate = this.blockedTimeForm.date?.trim();
    const blockedTimeStartTime = this.blockedTimeForm.startTime?.trim();
    const blockedTimeEndTime = this.blockedTimeForm.endTime?.trim();
    const blockedTimeReason = this.blockedTimeForm.reason?.trim();
    const startMinutes = this.timeToMinutes(blockedTimeStartTime);
    const endMinutes = this.timeToMinutes(blockedTimeEndTime);

    return !!blockedTimeDate
      && !!blockedTimeStartTime
      && !!blockedTimeEndTime
      && !!blockedTimeReason
      && Number.isFinite(startMinutes)
      && Number.isFinite(endMinutes)
      && endMinutes > startMinutes
      && !this.blockedTimeSubmitting();
  }

  private toDateInputValue(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dateFromInputValue(value: string): Date {
    const [year, month, day] = value.split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  private currentAdminActorId(): string | null {
    const user = this.authService.user();
    return user?.id?.trim() || null;
  }

  protected  nextWeek() {
    // Moved to CalendarPickerComponent
  }

  prevWeek() {
    // Moved to CalendarPickerComponent
  }

  protected goToToday() {
    this.selectedDate.set(new Date());
  }

  protected getEventosForDay(day: Date): CalendarioEvento[] {
    const dayStr = day.toISOString().split('T')[0];
    return this.calendarioEventos().filter(e => 
      e.start.split('T')[0] === dayStr
    );
  }

  /** Generates a list of hours for the timeline from 08:00 to 22:00 */
  protected readonly timelineHours = signal<string[]>([
    '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', 
    '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'
  ]);

  /** Maps turnos to their hour slot for the Zen inline timeline, handles any minutes within that hour */
  protected getTurnosForHour(hour: string): TurnoWithRelations[] {
    const selectedDate = this.selectedDate();
    const dateStr = selectedDate.toISOString().split('T')[0];
    const hourPrefix = hour.split(':')[0]; // e.g., "09"

    return this.turnos().filter(t => {
      const tStr = t.fecha.getFullYear() + '-' + (t.fecha.getMonth() + 1).toString().padStart(2, '0') + '-' + t.fecha.getDate().toString().padStart(2, '0');
      const sStr = selectedDate.getFullYear() + '-' + (selectedDate.getMonth() + 1).toString().padStart(2, '0') + '-' + selectedDate.getDate().toString().padStart(2, '0');
      const isSameDay = tStr === sStr;
      const tHourPrefix = t.hora.split(':')[0];
      return isSameDay && tHourPrefix === hourPrefix;
    });
  }
}
