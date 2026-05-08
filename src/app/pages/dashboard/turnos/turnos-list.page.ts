// Turnos List View Component - US-002
// Displays appointments in list format with filtering and sorting

import { Component, OnDestroy, OnInit, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { TurnoService } from '../../../services/turno.service';
import { ClienteService } from '../../../services/cliente.service';
import { ServicioService } from '../../../services/servicio.service';
import { AuthService } from '../../../services/auth.service';
import { CalendarPickerComponent } from '../../../shared/components/calendar-picker/calendar-picker.component';
import { ThemeService } from '../../../core/theming/theme.service';
import { Turno, TurnoEstado, CreateTurnoDTO, TurnoWithRelations } from '../../../models/turno.model';
import { Cliente } from '../../../models/cliente.model';
import { Servicio } from '../../../models/servicio.model';
import { createAdminBlockedTime, createAdminManualBooking } from '../../../core/api/supabase-booking.api';
import { BusinessSettingsFacade, WeekdayKey } from '../../../facades/business-settings.facade';

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
  private settingsFacade = inject(BusinessSettingsFacade);
  private authService = inject(AuthService);
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

  protected visibleLimit = signal<number>(4);

  // Computed: Get working hours for the selected date
  protected currentDayHours = computed(() => {
    const date = this.selectedDate();
    const days: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = days[date.getDay()];
    const settings = this.settingsFacade.state();
    
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
    console.log('[TurnosListPage] Iniciando carga de datos...');
    window.addEventListener('booking.created', this.onBookingCreated as EventListener);
    
    try {
      console.log('[TurnosListPage] Cargando Turnos...');
      await firstValueFrom(this.turnoService.getAll());
      
      console.log('[TurnosListPage] Cargando Clientes...');
      await firstValueFrom(this.clienteService.getAll());
      
      console.log('[TurnosListPage] Cargando Servicios...');
      await firstValueFrom(this.servicioService.getAll());
      
      this.clientes.set(this.clienteService.items());
      this.servicios.set(this.servicioService.items());
      
      console.log('[TurnosListPage] Procesando turnos finales...');
      await this.processTurnos();
      
      this.loading.set(false);
      console.log('[TurnosListPage] Carga completada con éxito.');
    } catch (error) {
      console.error('[TurnosListPage] Error crítico durante ngOnInit:', error);
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
    console.log(`[TurnosListPage] Turnos procesados y listos: ${turnosEnriquecidos.length}`);
    if (turnosEnriquecidos.length > 0) {
      console.log(`[TurnosListPage] Ejemplo de fecha de turno (local):`, turnosEnriquecidos[0].fecha);
      console.log(`[TurnosListPage] Fecha seleccionada actual (local):`, this.selectedDate());
    }
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
    } catch (error) {
      console.error('Error updating estado:', error);
    }
  }

  protected async deleteTurno(turnoId: string) {
    if (confirm('¿Está seguro de cancelar este turno?')) {
      try {
        await this.turnoService.delete(turnoId).toPromise();
        await this.processTurnos();
      } catch (error) {
        console.error('Error deleting turno:', error);
      }
    }
  }

  protected async cancelTurnoByAdmin(turnoId: string) {
    try {
      await this.turnoService.cancelByAdmin(turnoId, {
        performedBy: 'admin-ui',
        reason: 'Cancelado desde listado administrativo'
      }).toPromise();

      await this.processTurnos();
    } catch (error) {
      console.error('Error canceling turno by admin:', error);
    }
  }

  protected async rescheduleTurno(turno: TurnoWithRelations) {
    const nextHour = this.addMinutes(turno.hora, 60);

    try {
      await firstValueFrom(this.turnoService.rescheduleByAdmin(turno.id, {
        fecha: new Date(turno.fecha),
        hora: nextHour,
        performedBy: 'admin-ui',
        reason: 'Reprogramado desde acceso rápido'
      }));

      await this.refreshTurnosFromSource();
    } catch (error) {
      console.error('Error al reprogramar turno:', error);
    }
  }

  protected async cancelTurno(turno: TurnoWithRelations) {
    if (!confirm(`¿Estás seguro de que deseas cancelar el turno de ${turno.clienteNombre}?`)) return;

    try {
      await firstValueFrom(this.turnoService.cancelByAdmin(turno.id, {
        performedBy: 'admin-ui',
        reason: 'Cancelado desde acceso rápido'
      }));

      await this.refreshTurnosFromSource();
    } catch (error) {
      console.error('Error al cancelar turno:', error);
    }
  }

  protected async rescheduleByAdmin(turno: TurnoWithRelations) {
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
    this.showManualBookingPanel.set(true);
    this.manualBookingSuccess.set(false);
  }

  protected openBlockedTimePanel() {
    this.showBlockedTimePanel.set(true);
    this.blockedTimeCollision.set(false);
  }

  protected async submitAdminManualBooking() {
    const bizId = this.authService.user()?.id;
    if (!bizId) return;

    const response = await createAdminManualBooking({
      businessId: bizId,
      serviceId: this.servicios()[0]?.id || 'svc-001',
      startsAtIso: new Date().toISOString(),
      durationMinutes: 60,
      walkInName: 'Walk-in Cliente',
      professionalId: 'pro-001',
      performedBy: this.authService.user()?.nombre || 'admin',
      notes: 'Manual booking from admin list'
    });

    this.manualBookingSuccess.set(response.status === 201 && !!response.data);

    if (response.status === 201) {
      await this.processTurnos();
    }
  }

  protected async submitBlockedTime() {
    const bizId = this.authService.user()?.id;
    if (!bizId) return;

    const firstResponse = await createAdminBlockedTime({
      businessId: bizId,
      startsAtIso: new Date().toISOString(),
      endsAtIso: new Date(Date.now() + 3600000).toISOString(),
      reason: 'Lunch break',
      performedBy: this.authService.user()?.nombre || 'admin'
    });

    if (firstResponse.status === 201) {
      await this.processTurnos();
    }
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
