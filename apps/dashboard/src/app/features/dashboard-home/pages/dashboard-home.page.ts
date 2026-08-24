import { Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DashboardService } from '../../../core/dashboard/dashboard.service';
import { ThemeService } from '../../../core/theming/theme.service';
import { AuthService } from '../../../services/auth.service';
import { BusinessService } from '../../settings/data-access/business.service';
import { WeekdayKey } from '../../../models/business.model';
import { buildPublicBookingUrl } from '../../../core/booking/public-booking-url';
import { createIsMobileSignal } from '../../../core/shell/is-mobile/is-mobile';
import { isStandaloneDisplay } from '../../pwa-install/pwa-display';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-home.page.html',
  styles: [':host { display: block; }']
})
export class DashboardHomeComponent {
  protected readonly dashboardService = inject(DashboardService);
  protected readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly businessFacade = inject(BusinessService);
  protected readonly isMobile = createIsMobileSignal().isMobile;

  protected isPwaStandalone(): boolean {
    return isStandaloneDisplay();
  }

  protected readonly user = this.authService.user;
  protected readonly agendaStatus = this.dashboardService.agendaStatus;
  protected readonly featuredAppointments = this.dashboardService.featuredAppointments;
  protected readonly stats = this.dashboardService.stats;
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);
  private hydratedUserId: string | null = null;

  constructor() {
    effect(() => {
      const userId = this.authService.user()?.id;
      if (userId) {
        void this.hydrateBusinessSettings(userId);
      }
    });
  }

  /** Dynamic greeting based on current time */
  protected readonly greeting = computed(() => {
    const hour = this.dashboardService.now().getHours();
    if (hour < 5) return '¡Buenas noches!';
    if (hour < 12) return '¡Buen día!';
    if (hour < 20) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  });

  /** Business configuration details for the right sidebar */
  protected readonly businessInfo = computed(() => {
    const state = this.businessFacade.settings();
    const now = this.dashboardService.now();
    
    const days: WeekdayKey[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dayKey = days[now.getDay()];
    const hours = state?.workingHours?.[dayKey] || { start: '09:00', end: '18:00', enabled: true };
    
    // Calculate total minutes of the working day
    const [startH, startM] = hours.start.split(':').map(Number);
    const [endH, endM] = hours.end.split(':').map(Number);
    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);

    return {
      name: state?.businessName || 'Sucursal sin nombre',
      slug: state?.slug || '',
      workingRange: `${hours.start} - ${hours.end}`,
      totalMinutes: Math.max(0, totalMinutes)
    };
  });

  /** Informative message about current occupancy level */
  protected readonly occupancyMessage = computed(() => {
    const status = this.agendaStatus();
    const percentage = status.occupancyPercentage;
    const occupiedMins = status.totalMinutes - status.freeMinutes;
    const nextGap = status.freeGaps[0];
    
    let msg = '';
    const turnosText = status.totalAppointments === 1 ? 'turno agendado' : 'turnos agendados';
    
    if (status.totalMinutes === 0) msg = 'Jornada finalizada por hoy. ¡Buen descanso!';
    else if (percentage === 0) msg = `No tenés ${turnosText}. ¡Ideal para compartir tu link y recibir reservas!`;
    else if (percentage < 30) msg = `Tenés ${status.totalAppointments} ${turnosText}. ¡Aún hay mucho espacio disponible!`;
    else if (percentage < 70) msg = `¡Buen ritmo! Tenés ${status.totalAppointments} ${turnosText}. Tu agenda restante está a mitad de capacidad.`;
    else if (percentage < 90) msg = `¡Casi lleno! Tenés ${status.totalAppointments} ${turnosText}. Quedan muy pocos huecos para hoy.`;
    else msg = '¡Agenda llena! Tu productividad está al máximo para lo que queda del día.';

    if (nextGap && percentage > 0 && percentage < 100) {
      msg += ` Próximo hueco: ${nextGap.range.split(' - ')[0]}.`;
    }

    return msg;
  });

  /** Dynamic color for the occupancy indicator based on percentage */
  protected readonly occupancyColor = computed(() => {
    const percentage = this.agendaStatus().occupancyPercentage;
    if (percentage < 30) return 'emerald';
    if (percentage < 70) return 'yellow';
    if (percentage < 90) return 'orange';
    return 'rose';
  });

  protected bookingUrl(): string {
    const state = this.businessFacade.settings();
    const slug = state?.slug?.trim();
    if (!slug || slug === 'id-pendiente') {
      return 'Link de reservas no disponible';
    }

    return buildPublicBookingUrl(slug);
  }

  protected hasBookingUrl(): boolean {
    const slug = this.businessFacade.settings()?.slug?.trim();
    return Boolean(slug && slug !== 'id-pendiente');
  }

  protected async copyBookingUrl(): Promise<void> {
    this.copyFailed.set(false);
    if (!this.hasBookingUrl() || !navigator.clipboard?.writeText) {
      this.copyFailed.set(true);
      return;
    }

    try {
      await navigator.clipboard.writeText(this.bookingUrl());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.copied.set(false);
      this.copyFailed.set(true);
    }
  }

  ngOnInit(): void {
    const userId = this.authService.user()?.id;
    if (userId) void this.hydrateBusinessSettings(userId);
  }

  private async hydrateBusinessSettings(userId: string): Promise<void> {
    if (this.hydratedUserId === userId && this.businessFacade.settings()) {
      return;
    }

    this.hydratedUserId = userId;
    await this.businessFacade.loadFromSupabase(userId);
  }
}
