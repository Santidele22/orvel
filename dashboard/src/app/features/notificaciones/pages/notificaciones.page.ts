import { Component, computed, inject, signal } from '@angular/core';
import { DashboardNotificationsService } from '../../../core/notifications/dashboard-notifications.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-notificaciones',
  standalone: true,
  template: `
    <section data-testid="notificaciones-page" class="min-w-0 overflow-x-hidden p-4">
      @if (showRefreshFailed()) {
        <p class="text-sm font-semibold text-text-primary">No pudimos cargar las notificaciones</p>
      } @else if (notifications.notifications().length === 0) {
        <div data-testid="notificaciones-empty-state" class="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-bg-secondary shadow-inner">
            <i class="ri-notification-off-line text-3xl text-text-secondary/40" aria-hidden="true"></i>
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold text-text-primary">No hay notificaciones</p>
            <p class="text-[11px] font-medium uppercase tracking-wider text-text-secondary">Te avisaremos por aquí</p>
          </div>
        </div>
      } @else {
        <ul class="flex flex-col gap-2">
          @for (notif of notifications.notifications(); track notif.id) {
            <li data-testid="notificaciones-item" class="cursor-pointer rounded-xl bg-bg-secondary/50 p-3" (click)="onRead(notif.id)">
              <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                  <p class="truncate text-sm font-semibold text-text-primary">{{ notif.title }}</p>
                  <p class="line-clamp-2 text-xs text-text-secondary">{{ notif.body }}</p>
                </div>
                @if (notif.status === 'unread') {
                  <span class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" aria-hidden="true"></span>
                }
                <button
                  type="button"
                  data-testid="notificaciones-item-dismiss"
                  aria-label="Descartar notificación"
                  (click)="onDismiss($event, notif.id)"
                  class="shrink-0 text-text-secondary"
                >
                  <i class="ri-close-line" aria-hidden="true"></i>
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class NotificacionesPage {
  private readonly auth = inject(AuthService);
  readonly notifications = inject(DashboardNotificationsService);
  private readonly refreshFailed = signal(false);
  readonly showRefreshFailed = computed(
    () => this.refreshFailed() || Boolean(this.notifications.error()),
  );

  constructor() {
    void this.refreshIfAuthenticated();
  }

  async refreshIfAuthenticated(): Promise<void> {
    if (!this.auth.authenticated()) {
      this.refreshFailed.set(false);
      return;
    }

    try {
      await this.notifications.refreshForAdmin(undefined, { force: true });
      this.refreshFailed.set(false);
    } catch {
      this.refreshFailed.set(true);
    }
  }

  onRead(id: string): void {
    void this.notifications.readNotification(id);
  }

  onDismiss(event: MouseEvent, id: string): void {
    event.stopPropagation();
    void this.notifications.archiveAdminNotification(id);
  }
}
