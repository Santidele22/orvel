import { Component, signal, inject, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ThemeService } from '../../../core/theming/theme.service';
import { AuthService } from '../../../services/auth.service';
import { DashboardNotificationsService } from '../../../core/notifications/dashboard-notifications.service';

@Component({
  selector: 'app-zen-topbar',
  standalone: true,
  imports: [CommonModule],
  template: `
    <header data-testid="dashboard-topbar-responsive" class="hidden lg:flex w-full bg-bg-secondary/80 backdrop-blur-xl px-8 h-20 items-center justify-end shrink-0 animate-in fade-in duration-500 relative z-100 transition-all shadow-xl shadow-black/10">
      <div class="flex items-center gap-5">
        <div class="flex items-center gap-2 relative">
          <button
            type="button"
            data-testid="dashboard-topbar-notifications"
            aria-label="Abrir notificaciones"
            [attr.aria-busy]="notifications.loading()"
            [attr.aria-expanded]="showNotificationList()"
            (click)="toggleNotifications()"
            class="relative w-11 h-11 rounded-2xl border border-white/10 bg-bg-primary flex items-center justify-center text-text-primary shadow-lg shadow-black/20 transition-all hover:border-primary/40 hover:bg-primary/10 hover:text-white active:scale-95"
          >
              <i class="ri-notification-3-fill text-xl opacity-100"></i>
              @if (notifications.notificationsUnread()) {
                <span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-error border-2 border-bg-secondary animate-pulse"></span>
              }
          </button>

          @if (showNotificationList()) {
            <div
              data-testid="dashboard-topbar-notifications-panel"
              class="absolute right-0 top-full mt-4 w-80 bg-bg-secondary rounded-3xl shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 slide-in-from-top-4 duration-200 origin-top-right z-50 border border-white/5 shadow-black/50"
            >
              <div class="flex items-center justify-between px-1">
                <h3 class="text-[10px] font-bold text-text-primary uppercase tracking-[0.2em]">Notificaciones</h3>
                @if (notificationList().length > 0) {
                  <button (click)="clearAllNotifications($event)" class="text-[9px] font-bold text-text-secondary hover:text-primary transition-colors uppercase tracking-widest px-2 py-1">Limpiar</button>
                }
              </div>

              <div class="max-h-80 overflow-y-auto flex flex-col gap-2 pr-1" style="scrollbar-width: thin;">
                @if (notificationList().length === 0 && showNotificationRefreshFailed()) {
                  <div class="py-10 flex flex-col items-center justify-center text-center gap-3">
                    <div class="w-16 h-16 rounded-2xl bg-bg-primary flex items-center justify-center shadow-inner">
                      <i class="ri-wifi-off-line text-3xl text-text-secondary/20"></i>
                    </div>
                    <div class="space-y-1">
                      <p class="text-xs font-bold text-text-primary">No pudimos cargar las notificaciones</p>
                      <p class="text-[9px] font-medium text-text-secondary uppercase tracking-wider">Intentá de nuevo en unos segundos</p>
                    </div>
                  </div>
                } @else if (notificationList().length === 0) {
                  <div class="py-10 flex flex-col items-center justify-center text-center gap-3">
                    <div class="w-16 h-16 rounded-2xl bg-bg-primary flex items-center justify-center shadow-inner">
                      <i class="ri-notification-off-line text-3xl text-text-secondary/20"></i>
                    </div>
                    <div class="space-y-1">
                      <p class="text-xs font-bold text-text-primary">No hay notificaciones</p>
                      <p class="text-[9px] font-medium text-text-secondary uppercase tracking-wider">Te avisaremos por aquí</p>
                    </div>
                  </div>
                } @else {
                  @for (notif of notificationList(); track notif.id) {
                    <div 
                      (click)="markNotificationRead(notif.id)"
                      class="p-3 rounded-2xl bg-bg-primary hover:bg-primary/10 transition-all cursor-pointer group relative border border-white/5"
                    >
                      <div class="flex justify-between items-start gap-3">
                        <div class="space-y-1 flex-1">
                          <p class="text-[10px] font-bold text-text-primary group-hover:text-primary transition-colors">{{ notif.title }}</p>
                          <p class="text-[9px] text-text-secondary leading-relaxed line-clamp-2">{{ notif.body }}</p>
                        </div>
                        @if (notif.status === 'unread') {
                          <span class="w-1.5 h-1.5 rounded-full bg-primary shrink-0 mt-1"></span>
                        }
                      </div>
                    </div>
                  }
                }
              </div>
            </div>

            <!-- Click outside backdrop -->
            <div class="fixed inset-0 z-40" (click)="showNotificationList.set(false)"></div>
          }
        </div>
      </div>
    </header>
  `
})
export class ZenTopbarComponent {
  readonly themeService = inject(ThemeService);
  readonly authService = inject(AuthService);
  readonly notifications = inject(DashboardNotificationsService);
  readonly showNotificationList = signal(false);

  readonly unreadNotificationCount = this.notifications.unreadNotificationCount;
  readonly notificationList = this.notifications.notifications;
  readonly notificationRefreshFailed = signal(false);
  readonly showNotificationRefreshFailed = computed(() =>
    this.isAdminUser() && (this.notificationRefreshFailed() || Boolean(this.notifications.error()))
  );
  @Input() onLogout: () => void | Promise<void> = () => { };

  constructor() {
    void this.refreshAdminNotifications();
  }

  private isAdminUser(): boolean {
    return this.authService.authenticated();
  }

  async refreshAdminNotifications(): Promise<void> {
    if (!this.isAdminUser()) {
      this.notificationRefreshFailed.set(false);
      return;
    }

    try {
      await this.notifications.refreshForAdmin();
      this.notificationRefreshFailed.set(false);
    } catch {
      this.notificationRefreshFailed.set(true);
    }
  }

  async toggleNotifications(): Promise<void> {
    this.showNotificationList.update((visible) => !visible);

    if (this.isAdminUser()) {
      await this.refreshAdminNotifications();
    }
  }

  async markNotificationRead(notificationId: string): Promise<void> {
    if (!this.isAdminUser()) {
      return;
    }

    await this.notifications.readNotification(notificationId);
  }

  async archiveNotification(notificationId: string): Promise<void> {
    if (!this.isAdminUser()) {
      return;
    }

    await this.notifications.archiveAdminNotification(notificationId);
  }

  async clearAllNotifications(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    if (!this.isAdminUser()) return;
    
    await this.notifications.clearAll();
  }

}
