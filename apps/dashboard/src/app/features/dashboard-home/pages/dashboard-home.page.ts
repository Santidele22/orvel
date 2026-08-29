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
import { isIosDevice, isStandaloneDisplay } from '../../pwa-install/pwa-display';
import { evaluateOperatorWebPush, readVapidPublicKey } from '../../operator-web-push/operator-web-push-eligibility';
import { OperatorWebPushService } from '../../operator-web-push/operator-web-push.service';
import { pickNextAppointment } from './pick-next-appointment';
import { ARGENTINA_TIME_ZONE, readArgentinaClock } from '../../../core/time/argentina-clock';

@Component({
  selector: 'app-dashboard-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './dashboard-home.page.html',
  host: {
    '[class.mobile-inicio-bleed]': 'isMobile()',
  },
  styles: [`
    :host { display: block; }

    :host.mobile-inicio-bleed {
      background:
        radial-gradient(120% 60% at 15% -5%, rgba(124, 92, 255, 0.16), transparent 55%),
        radial-gradient(90% 40% at 100% 0%, rgba(124, 92, 255, 0.08), transparent 50%),
        #0A0E1B;
    }

    :host.mobile-inicio-bleed::before {
      content: '';
      position: fixed;
      inset: 0;
      z-index: 0;
      pointer-events: none;
      background: inherit;
    }

    :host.mobile-inicio-bleed > * {
      position: relative;
      z-index: 1;
    }

    .mobile-inicio {
      font-family: 'Manrope', sans-serif;
      background:
        radial-gradient(120% 60% at 15% -5%, rgba(124, 92, 255, 0.16), transparent 55%),
        radial-gradient(90% 40% at 100% 0%, rgba(124, 92, 255, 0.08), transparent 50%),
        #0A0E1B;
    }

    .mobile-inicio h1,
    .mobile-inicio h2 {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
  `]
})
export class DashboardHomeComponent {
  protected readonly dashboardService = inject(DashboardService);
  protected readonly themeService = inject(ThemeService);
  private readonly authService = inject(AuthService);
  private readonly businessFacade = inject(BusinessService);
  private readonly webPush = inject(OperatorWebPushService);
  protected readonly isMobile = createIsMobileSignal().isMobile;

  protected isPwaStandalone(): boolean {
    return isStandaloneDisplay();
  }

  protected showWebPushCoach(): boolean {
    const notificationSupported = typeof Notification !== 'undefined';
    return evaluateOperatorWebPush({
      isIos: isIosDevice(
        navigator.userAgent,
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      ),
      isStandalone: this.isPwaStandalone(),
      notificationSupported,
      permission: notificationSupported ? Notification.permission : 'unsupported',
      vapidPublicKey: readVapidPublicKey(),
    }).canRequest;
  }

  protected enableWebPush(): void {
    void this.webPush.enableFromUserGesture();
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
    const hour = Math.floor(readArgentinaClock(this.dashboardService.now()).minutes / 60);
    if (hour < 5) return '¡Buenas noches!';
    if (hour < 12) return '¡Buen día!';
    if (hour < 20) return '¡Buenas tardes!';
    return '¡Buenas noches!';
  });

  protected readonly eyebrowDate = computed(() => {
        const formatted = this.dashboardService.now().toLocaleDateString('es-AR', {
      timeZone: ARGENTINA_TIME_ZONE,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
    return formatted.charAt(0).toUpperCase() + formatted.slice(1);
  });

  protected readonly operatorFirstName = computed(() => {
    const name = this.user()?.nombre?.trim() ?? '';
    return name.split(/\s+/)[0] || '';
  });

  protected readonly operatorInitial = computed(() => {
    const name = this.operatorFirstName();
    return name ? name.charAt(0).toUpperCase() : '?';
  });

  protected readonly occupancyDots = computed(() => {
    const status = this.agendaStatus();
    const total = Math.max(0, status.capacitySlots);
    const filled = Math.max(0, Math.min(total, status.freeSlots));
    return Array.from({ length: total }, (_, index) => index < filled);
  });

  protected readonly nextUpcomingAppointment = computed(() =>
    pickNextAppointment(this.featuredAppointments(), this.dashboardService.now()),
  );

  protected relativeTimeBadge(turno: { hora?: string; dateLabel?: string }): string {
    if (turno.dateLabel && turno.dateLabel !== 'Hoy') {
      return turno.dateLabel;
    }
    const [hours, minutes] = (turno.hora || '00:00').split(':').map(Number);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
      return 'Hoy';
    }
    const diffMinutes = hours * 60 + minutes - readArgentinaClock(this.dashboardService.now()).minutes;
    if (diffMinutes <= 0) return 'Ahora';
    if (diffMinutes < 60) return `En ${diffMinutes}m`;
    return `En ${Math.round(diffMinutes / 60)}h`;
  }

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

  private async hydrateBusinessSettings(userId: string): Promise<void> {
    if (this.businessFacade.hasHydratedSnapshot(userId) || (this.hydratedUserId === userId && this.businessFacade.settings())) {
      return;
    }

    this.hydratedUserId = userId;
    await this.businessFacade.loadFromSupabase(userId);
  }
}
