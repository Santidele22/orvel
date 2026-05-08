import { Component, signal, inject, Input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ThemeService } from '../../../core/theming/theme.service';
import { AuthService } from '../../../services/auth.service';
import { BusinessSettingsFacade } from '../../../facades/business-settings.facade';
import { DashboardNotificationsService } from '../../../core/notifications/dashboard-notifications.service';

@Component({
  selector: 'app-zen-topbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <header data-testid="dashboard-topbar-responsive" class="w-full bg-bg-secondary/80 backdrop-blur-xl px-8 h-20 flex items-center justify-end shrink-0 animate-in fade-in duration-500 relative z-100 transition-all shadow-xl shadow-black/10">
      <div class="flex items-center gap-5">
        <div class="flex items-center gap-2 relative">
          <button
            type="button"
            data-testid="dashboard-topbar-notifications"
            aria-label="Abrir notificaciones"
            [attr.aria-busy]="notifications.loading()"
            [attr.aria-expanded]="showNotificationList()"
            (click)="toggleNotifications()"
            class="relative w-11 h-11 rounded-2xl bg-bg-primary flex items-center justify-center text-text-secondary hover:text-text-primary transition-all shadow-lg active:scale-95"
          >
              <i class="ri-notification-3-fill text-xl"></i>
              @if (notifications.notificationsUnread()) {
                <span class="absolute top-2.5 right-2.5 w-2 h-2 rounded-full bg-error border-2 border-bg-secondary animate-pulse"></span>
              }
          </button>

          @if (showNotificationList()) {
            <div class="absolute right-0 top-full mt-4 w-80 bg-tertiary rounded-3xl shadow-2xl p-5 flex flex-col gap-4 animate-in zoom-in-95 slide-in-from-top-4 duration-200 origin-top-right z-50 border border-white/5 shadow-black/50">
              <div class="flex items-center justify-between px-1">
                <h3 class="text-[10px] font-bold text-text-primary uppercase tracking-[0.2em]">Notificaciones</h3>
                @if (notificationList().length > 0) {
                  <button (click)="clearAllNotifications($event)" class="text-[9px] font-bold text-text-secondary hover:text-primary transition-colors uppercase tracking-widest px-2 py-1">Limpiar</button>
                }
              </div>

              <div class="max-h-80 overflow-y-auto flex flex-col gap-2 pr-1" style="scrollbar-width: thin;">
                @if (notificationList().length === 0) {
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
                      class="p-3 rounded-2xl bg-bg-primary/50 hover:bg-primary/10 transition-all cursor-pointer group relative border border-white/5"
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

        <div class="h-6 w-px bg-white/5 mx-2 hidden sm:block"></div>

        <div class="relative">
          <button 
            (click)="toggleMenu()"
            class="flex items-center gap-3 p-1.5 bg-bg-primary rounded-2xl hover:shadow-2xl hover:shadow-black/20 transition-all active:scale-95 group shadow-xl">
             <div class="w-9 h-9 rounded-[14px] bg-primary/20 flex items-center justify-center text-primary font-bold text-sm overflow-hidden shadow-inner">
                  {{ (authService.user()?.nombre?.charAt(0) || authService.user()?.email?.charAt(0) || 'U') | uppercase }}
              </div>
              <div class="hidden sm:flex flex-col items-start pr-2">
                <span class="text-[11px] font-bold text-text-primary leading-none uppercase tracking-wide">{{ authService.user()?.nombre || 'Usuario' }} {{ authService.user()?.apellido || '' }}</span>
                <span class="text-[9px] font-medium text-text-secondary uppercase tracking-[0.2em]">{{ businessName() }}</span>
              </div>
              <i class="ri-arrow-down-s-line text-text-secondary pr-1 group-hover:text-primary transition-colors" [class.rotate-180]="showUserMenu()"></i>
           </button>

          @if (showUserMenu()) {
             <div 
              class="absolute right-0 top-full mt-4 w-72 bg-bg-primary rounded-3xl shadow-2xl shadow-black/40 p-6 flex flex-col gap-1 animate-in zoom-in-95 slide-in-from-top-4 duration-300 origin-top-right overflow-hidden">
                 
               <div class="px-2 py-4 mb-2 flex items-center gap-4">
                 <div class="w-12 h-12 rounded-2xl bg-primary/20 flex items-center justify-center text-primary text-xl font-bold shadow-inner">{{ (authService.user()?.nombre?.charAt(0) || 'U') + (authService.user()?.apellido?.charAt(0) || 'A') | uppercase }}</div>
                 <div class="space-y-0.5">
                  <h4 class="text-sm font-bold text-text-primary">{{ authService.user()?.nombre ? (authService.user()?.nombre + ' ' + (authService.user()?.apellido || '')) : 'Mi Perfil' }}</h4>
                   <p class="text-[10px] font-medium text-text-secondary truncate w-32">{{ authService.user()?.email || 'Verificando...' }}</p>
                 </div>
               </div>

               <div class="px-4 py-3 flex items-center justify-between group/toggle cursor-pointer hover:bg-primary/10 rounded-2xl transition-all" (click)="themeService.toggleDarkMode()">
                   <div class="flex items-center gap-3">
                     <div class="w-8 h-8 rounded-xl bg-bg-primary shadow-lg flex items-center justify-center">
                        <i [class]="themeService.isDarkMode() ? 'ri-moon-clear-fill text-primary' : 'ri-sun-fill text-warning'" class="text-base"></i>
                     </div>
                     <span class="text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary group-hover/toggle:text-primary">Modo Oscuro</span>
                   </div>
                   <!-- Toggle UI -->
                   <div class="w-10 h-6 rounded-full p-1 transition-all duration-300" [class]="themeService.isDarkMode() ? 'bg-primary' : 'bg-slate-700'">
                      <div class="w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-300" [style.transform]="themeService.isDarkMode() ? 'translateX(100%)' : 'translateX(0)'"></div>
                   </div>
               </div>

               <div class="h-px bg-white/5 my-2"></div>

                <button class="w-full h-12 flex items-center gap-3 px-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary hover:bg-primary/10 hover:text-primary transition-all group">
                  <i class="ri-user-smile-fill text-lg opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all"></i>
                  <span>Mi Perfil</span>
                </button>

                <button class="w-full h-12 flex items-center gap-3 px-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] text-text-secondary hover:bg-primary/10 hover:text-primary transition-all group">
                  <i class="ri-settings-4-fill text-lg opacity-50 group-hover:opacity-100 group-hover:scale-110 transition-all"></i>
                  <span>Ajustes</span>
                </button>

                <div class="h-px bg-white/5 my-2"></div>

                <button (click)="onLogout()" class="w-full h-12 flex items-center gap-3 px-4 rounded-2xl text-[10px] font-bold uppercase tracking-[0.2em] text-error opacity-80 hover:bg-error/10 transition-all group">
                  <i class="ri-logout-circle-r-fill text-lg group-hover:scale-110 transition-all"></i>
                  <span>Finalizar</span>
                </button>
             </div>

            <!-- Backdrop to close -->
            <div class="fixed inset-0 z-[-1]" (click)="showUserMenu.set(false)"></div>
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
  private readonly businessFacade = inject(BusinessSettingsFacade);
  readonly showUserMenu = signal(false);
  readonly showNotificationList = signal(false);

  readonly unreadNotificationCount = this.notifications.unreadNotificationCount;
  readonly notificationList = this.notifications.notifications;

  readonly businessName = computed(() => {
    return this.businessFacade.state()?.businessName || this.authService.user()?.negocioNombre || 'Mi Negocio';
  });

  @Input() onLogout: () => void = () => { this.authService.logout(); };

  constructor() {
    void this.refreshAdminNotifications();
  }

  private isAdminUser(): boolean {
    return this.authService.authenticated();
  }

  async refreshAdminNotifications(): Promise<void> {
    if (!this.isAdminUser()) {
      return;
    }

    await this.notifications.refreshForAdmin();
  }

  async toggleNotifications(): Promise<void> {
    if (!this.isAdminUser()) {
      return;
    }

    this.showNotificationList.update((visible) => !visible);
    await this.refreshAdminNotifications();
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

  toggleMenu() {
    this.showUserMenu.update(v => !v);
  }
}
