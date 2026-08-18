import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { TurnoService } from '../../features/booking/data-access/turno.facade';
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { WeekdayKey } from '../../models/business.model';

@Injectable({
  providedIn: 'root'
})
export class DashboardService {
  private readonly turnoService = inject(TurnoService);
  private readonly clienteService = inject(ClienteService);
  private readonly servicioService = inject(ServicioService);
  private readonly businessService = inject(BusinessService);
  private readonly destroyRef = inject(DestroyRef);

  // Time signal for real-time updates
  readonly now = signal(new Date());

  // Loading and Error states
  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  /**
   * Calculates agenda status for today based on real working hours and appointments.
   */
  readonly agendaStatus = computed(() => {
    const turnos = this.turnoService.items();
    const settings = this.businessService.settings();
    const now = this.now();
    
    const hoy = new Date();
    const days: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = days[hoy.getDay()];
    
    const workingDay = settings?.workingHours?.[dayKey] || { start: '09:00', end: '18:00', enabled: true };
    const slotInterval = settings?.slotIntervalMinutes || 30;

    if (!workingDay.enabled) {
      return { totalAppointments: 0, freeSlots: 0, freeMinutes: 0, freeGaps: [], totalMinutes: 0, occupancyPercentage: 0 };
    }

    const [startH, startM] = workingDay.start.split(':').map(Number);
    const [endH, endM] = workingDay.end.split(':').map(Number);
    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    
    // Total minutes remaining in the workday
    const totalMinutesRemaining = Math.max(0, endMinutes - Math.max(startMinutes, nowMinutes));
    const capacitySlots = Math.floor(totalMinutesRemaining / slotInterval);

    const normalizeDate = (fecha: string | Date | undefined): number => {
      if (!fecha) return 0;
      const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const hoyMs = normalizeDate(hoy);
    const nowTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const turnosHoy = turnos.filter(t => normalizeDate(t.fecha) === hoyMs && !['cancelado', 'no-asistio'].includes(t.estado));
    const turnosFuturos = turnosHoy.filter(t => {
      const tStart = t.hora || '00:00';
      const tDuration = t.duracionMinutos || 30;
      const [h, m] = tStart.split(':').map(Number);
      const tEndMinutes = h * 60 + m + tDuration;
      return tEndMinutes > nowMinutes;
    });
    
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
      totalAppointments: turnosFuturos.length,
      freeSlots: Math.max(0, capacitySlots - occupiedSlotsRemaining),
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
    const turnos = this.turnoService.items();
    const services = this.servicioService.items();
    const clients = this.clienteService.items();
    const servicesMap = new Map(services.map(s => [s.id, s.nombre]));
    const clientsMap = new Map(clients.map(c => [c.id, c.nombre]));

    const hoy = new Date();
    hoy.setHours(0, 0, 0, 0);
    const hoyMs = hoy.getTime();

    const now = this.now();
    const nowTimeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    const normalizeDate = (fecha: string | Date | undefined): number => {
      if (!fecha) return 0;
      const d = typeof fecha === 'string' ? new Date(fecha) : fecha;
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };

    const hoyTurnos = turnos
      .filter(t => normalizeDate(t.fecha) === hoyMs && (t.hora || '00:00') >= nowTimeStr)
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

    const futureTurnos = turnos
      .filter(t => normalizeDate(t.fecha) > hoyMs)
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
      const tDate = normalizeDate(t.fecha);
      let dateLabel = '';
      if (tDate === hoyMs) dateLabel = 'Hoy';
      else if (tDate === mañanaMs) dateLabel = 'Mañana';
      else {
        const d = new Date(t.fecha!);
        dateLabel = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' }).replace('.', '');
      }

      return {
        ...t,
        clienteNombre: clientsMap.get(t.clienteId) || 'Cliente',
        servicioNombre: servicesMap.get(t.servicioId) || 'Servicio',
        dateLabel
      };
    });
  });

  /**
   * Calculates overall business stats for the dashboard.
   */
  readonly stats = computed(() => {
    const turnos = this.turnoService.items();
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
    this.refreshData();

    // Update 'now' signal every minute for real-time filtering
    const interval = setInterval(() => {
      this.now.set(new Date());
    }, 60000);

    this.destroyRef.onDestroy(() => clearInterval(interval));
  }

  refreshData(): void {
    this.isLoading.set(true);
    this.turnoService.getAll().subscribe({
      next: () => {
        this.clienteService.getAll().subscribe({
          next: () => {
            this.servicioService.getAll().subscribe({
              next: () => this.isLoading.set(false),
              error: () => this.isLoading.set(false)
            });
          },
          error: () => this.isLoading.set(false)
        });
      },
      error: () => this.isLoading.set(false)
    });
  }
}
