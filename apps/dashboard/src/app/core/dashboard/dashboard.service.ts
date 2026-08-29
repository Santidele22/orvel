import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import type { BookingQueries, BookingRecord } from '@orvel/booking/application';
import { BOOKING_QUERIES } from '@orvel/booking/infrastructure';
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { WeekdayKey } from '../../models/business.model';
import { getBranchContextService, registerSectionCacheInvalidator } from '../branches/branch-context.service';
import { ArgentinaClockService } from '../time/argentina-clock.service';
import {
  civilDateKey,
  filterLiveTurnos,
  localDateFromDateKey,
  readArgentinaClock,
  weekdayIndexFromDateKey,
} from '../time/argentina-clock';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly bookingQueries = inject<BookingQueries>(BOOKING_QUERIES);
  private readonly clienteService = inject(ClienteService);
  private readonly servicioService = inject(ServicioService);
  private readonly businessService = inject(BusinessService);
  private readonly destroyRef = inject(DestroyRef);
  readonly now = inject(ArgentinaClockService).now;
  private readonly bookings = signal<BookingRecord[]>([]);
  private readonly adminBookings = signal<BookingRecord[]>([]);
  private bookingsLoaded = false;
  private adminBookingsLoadedBranchId: string | null = null;
  private refreshGeneration = 0;

  // Loading and Error states
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Calculates agenda status for today based on real working hours and appointments.
   */
  readonly agendaStatus = computed(() => {
    const turnos = this.bookings();
    const settings = this.businessService.settings();
    const clock = readArgentinaClock(this.now());
    const days: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = days[weekdayIndexFromDateKey(clock.dateKey)];
    
    const workingDay = settings?.workingHours?.[dayKey];
    const slotInterval = settings?.slotIntervalMinutes || 30;
    const nowMinutes = clock.minutes;

    const turnosHoy = turnos.filter(t => civilDateKey(t.fecha) === clock.dateKey && !['cancelado', 'no-asistio'].includes(t.estado));
    const turnosFuturos = filterLiveTurnos(turnosHoy, clock);

    if (!workingDay?.enabled) {
      return {
        totalAppointments: turnosHoy.length,
        remainingAppointments: turnosFuturos.length,
        freeSlots: 0,
        capacitySlots: 0,
        freeMinutes: 0,
        freeGaps: [] as { range: string; duration: string; label: string }[],
        totalMinutes: 0,
        occupancyPercentage: 0,
      };
    }

    const [startH, startM] = workingDay.start.split(':').map(Number);
    const [endH, endM] = workingDay.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    
    // Total minutes remaining in the workday
    const totalMinutesRemaining = Math.max(0, endMinutes - Math.max(startMinutes, nowMinutes));
    const capacitySlots = Math.floor(totalMinutesRemaining / slotInterval);
    
    const occupiedMinutesRemaining = turnosFuturos.reduce((acc, t) => {
      const [h, m] = (t.hora || '00:00').split(':').map(Number);
      const tStartMinutes = h * 60 + m;
      const tDuration = t.duracionMinutos || 30;
      // If turn is in progress, only count remaining minutes
      const effectiveStart = Math.max(tStartMinutes, nowMinutes);
      const tEndMinutes = tStartMinutes + tDuration;
      return acc + Math.max(0, tEndMinutes - effectiveStart);
    }, 0);

    const occupiedSlotsRemaining = turnosFuturos.reduce((acc, t) => {
      const duration = t.duracionMinutos || 30;
      return acc + Math.ceil(duration / slotInterval);
    }, 0);
    
    const occupancyPercentage = totalMinutesRemaining > 0 
      ? Math.min(100, Math.round((occupiedMinutesRemaining / totalMinutesRemaining) * 100)) 
      : 0;

    // Calculate free gaps
    const sortedTurnos = [...turnosHoy].sort((a, b) => a.hora.localeCompare(b.hora));
    const gaps: any[] = [];
    const parseTime = (h: string) => {
      const [hh, mm] = h.split(':').map(Number);
      return hh * 60 + mm;
    };
    const formatTime = (m: number) => {
      const hh = Math.floor(m / 60).toString().padStart(2, '0');
      const mm = (m % 60).toString().padStart(2, '0');
      return `${hh}:${mm}`;
    };

    let currentPos = Math.max(startH * 60 + startM, nowMinutes);
    const endPos = endH * 60 + endM;

    for (const t of sortedTurnos) {
      const tStart = parseTime(t.hora);
      const tEnd = tStart + (t.duracionMinutos || 30);
      if (tStart > currentPos + 14) {
        const duration = tStart - currentPos;
        const h = Math.floor(duration / 60);
        const m = duration % 60;
        const durationStr = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
        
        let label = 'Tarde';
        if (currentPos < 720) label = 'Mañana';
        else if (currentPos < 840) label = 'Mediodía';

        gaps.push({
          range: `${formatTime(currentPos)} - ${formatTime(tStart)}`,
          duration: durationStr,
          label
        });
      }
      currentPos = Math.max(currentPos, tEnd);
    }
    if (currentPos + 14 < endPos) {
      const duration = endPos - currentPos;
      const h = Math.floor(duration / 60);
      const m = duration % 60;
      const durationStr = `${h > 0 ? h + 'h ' : ''}${m > 0 ? m + 'm' : ''}`.trim();
      
      let label = 'Tarde';
      if (currentPos < 720) label = 'Mañana';
      else if (currentPos < 840) label = 'Mediodía';

      gaps.push({
        range: `${formatTime(currentPos)} - ${formatTime(endPos)}`,
        duration: durationStr,
        label
      });
    }

    return {
      totalAppointments: turnosHoy.length,
      remainingAppointments: turnosFuturos.length,
      freeSlots: Math.max(0, capacitySlots - occupiedSlotsRemaining),
      capacitySlots: Math.max(0, capacitySlots),
      freeMinutes: Math.max(0, totalMinutesRemaining - occupiedMinutesRemaining),
      freeGaps: gaps as any[],
      totalMinutes: totalMinutesRemaining,
      occupancyPercentage
    };
  });

  /**
   * Returns a prioritized list of appointments for the home roadmap.
   */
  readonly featuredAppointments = computed(() => {
    const turnos = this.bookings();
    const services = this.servicioService.items();
    const clients = this.clienteService.items();
    const servicesMap = new Map(services.map(s => [s.id, s.nombre]));
    const clientsMap = new Map(clients.map(c => [c.id, c.nombre]));

    const clock = readArgentinaClock(this.now());
    const hoyMs = localDateFromDateKey(clock.dateKey).getTime();

    const hoyTurnos = filterLiveTurnos(
      turnos.filter(t => civilDateKey(t.fecha) === clock.dateKey && !['cancelado', 'no-asistio'].includes(t.estado)),
      clock,
    ).sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

    const futureTurnos = turnos
      .filter(t => civilDateKey(t.fecha) > clock.dateKey)
      .sort((a, b) => {
        const dateA = new Date(a.fecha!).getTime();
        const dateB = new Date(b.fecha!).getTime();
        if (dateA !== dateB) return dateA - dateB;
        return (a.hora || '').localeCompare(b.hora || '');
      });

    const combined = [...hoyTurnos];
    if (combined.length < 6) {
      const needed = 6 - combined.length;
      combined.push(...futureTurnos.slice(0, needed));
    }

    const mañanaMs = hoyMs + 86400000;

    return combined.map(t => {
      const tDate = localDateFromDateKey(civilDateKey(t.fecha)).getTime();
      let dateLabel = '';
      if (tDate === hoyMs) dateLabel = 'Hoy';
      else if (tDate === mañanaMs) dateLabel = 'Mañana';
      else {
        const d = new Date(t.fecha!);
        dateLabel = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).replace('.', '');
      }

      return {
        ...t,
        clienteNombre: clientsMap.get(t.clienteId ?? '') || 'Cliente',
        servicioNombre: servicesMap.get(t.servicioId ?? '') || 'Servicio',
        dateLabel
      };
    });
  });

  /**
   * Calculates overall business stats for the dashboard.
   */
  readonly stats = computed(() => {
    const turnos = this.bookings();
    const clientes = this.clienteService.items();
    
    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyMs = hoy.getTime();
    
    // Average ticket today (completed appointments only)
    const turnosCompletadosHoy = turnos.filter(t => {
      if (!t.fecha) return false;
      const d = new Date(t.fecha);
      const tMs = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      return tMs === hoyMs && t.estado === 'completado';
    });
    
    const totalVentas = turnosCompletadosHoy.reduce((acc, t) => acc + (t.precio || 0), 0);
    const ticketPromedio = turnosCompletadosHoy.length > 0 ? totalVentas / turnosCompletadosHoy.length : 0;
    
    // New clients this month
    const primerDiaMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).getTime();
    const nuevosClientes = clientes.filter(c => {
      if (!c.createdAt) return false;
      const d = new Date(c.createdAt);
      return d.getTime() >= primerDiaMes;
    }).length;
    
    return {
      ticketPromedio,
      nuevosClientes
    };
  });

  constructor() {
    registerSectionCacheInvalidator(() => this.clearCache());
    this.refreshData();

    const onAgendaSync = () => {
      this.invalidate();
      this.refreshData();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        this.invalidate();
        this.refreshData();
      }
    };
    window.addEventListener('booking.created', onAgendaSync);
    window.addEventListener('operator.agenda.sync', onAgendaSync);
    document.addEventListener('visibilitychange', onVisibilityChange);

    this.destroyRef.onDestroy(() => {
      window.removeEventListener('booking.created', onAgendaSync);
      window.removeEventListener('operator.agenda.sync', onAgendaSync);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    });
  }

  isAdminBookingsWarm(branchId: string): boolean {
    return this.adminBookingsLoadedBranchId === branchId;
  }

  getAdminBookings(): BookingRecord[] {
    return this.adminBookings();
  }

  rememberAdminBookings(branchId: string, rows: BookingRecord[]): void {
    this.adminBookingsLoadedBranchId = branchId;
    this.adminBookings.set(rows);
  }

  invalidate(): void {
    this.bookingsLoaded = false;
    this.adminBookingsLoadedBranchId = null;
  }

  clearCache(): void {
    this.invalidate();
    this.bookings.set([]);
    this.adminBookings.set([]);
  }

  refreshData(): void {
    if (this.bookingsLoaded) {
      return;
    }
    this.isLoading.set(true);
    const generation = ++this.refreshGeneration;
    void this.loadBookings(generation);
  }

  private async loadBookings(generation: number): Promise<void> {
    const branchContext = getBranchContextService();
    await branchContext.ensureLoaded();
    if (generation !== this.refreshGeneration) return;

    const branchId = branchContext.getActiveBranchId() ?? '';
    if (!branchId) {
      this.bookings.set([]);
      this.isLoading.set(false);
      return;
    }

    const from = new Date();
    from.setHours(0, 0, 0, 0);
    const to = new Date(from);
    to.setDate(to.getDate() + 14);

    try {
      const rows = await this.bookingQueries.listBookingsByBranch(branchId, { from, to });
      if (generation !== this.refreshGeneration) return;
      this.bookings.set(rows);
      this.bookingsLoaded = true;
      this.clienteService.getAll().subscribe({
        next: () => {
          this.servicioService.getAll().subscribe({
            next: () => this.isLoading.set(false),
            error: () => this.isLoading.set(false)
          });
        },
        error: () => this.isLoading.set(false)
      });
    } catch {
      if (generation !== this.refreshGeneration) return;
      this.isLoading.set(false);
    }
  }
}
