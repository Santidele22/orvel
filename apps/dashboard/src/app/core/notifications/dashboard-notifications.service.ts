import { Injectable, computed, signal, inject, OnDestroy } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { createSupabaseClient } from '../api/supabase-booking/real-gateway';
import {
  archiveNotification,
  getUnreadNotificationCount,
  listAdminNotifications,
  markNotificationRead,
  archiveAllNotifications,
  type DashboardNotification,
} from './internal-dashboard-notifications.api';
import { RealtimeChannel } from '@supabase/supabase-js';

@Injectable({ providedIn: 'root' })
export class DashboardNotificationsService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationsState = signal<DashboardNotification[]>([]);
  private readonly unreadNotificationCountState = signal(0);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private subscription: RealtimeChannel | null = null;

  readonly notifications = this.notificationsState.asReadonly();
  readonly unreadNotificationCount = this.unreadNotificationCountState.asReadonly();
  readonly notificationsUnread = computed(() => this.unreadNotificationCountState() > 0);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    // Auto-refresh and subscribe when user is available
    this.init();
  }

  ngOnDestroy(): void {
    this.stopSubscription();
  }

  private async init() {
    const businessId = this.authService.user()?.id;
    if (businessId) {
      await this.refreshForAdmin();
      this.startSubscription(businessId);
    }
  }

  private startSubscription(businessId: string) {
    this.stopSubscription();
    const supabase = createSupabaseClient();
    
    this.subscription = supabase
      .channel(`notifications:${businessId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'dashboard_notifications',
          filter: `business_id=eq.${businessId}`,
        },
        () => {
          console.log('[Notifications] Change detected, refreshing...');
          void this.refreshForAdmin();
        }
      )
      .subscribe();
  }

  private stopSubscription() {
    if (this.subscription) {
      void this.subscription.unsubscribe();
      this.subscription = null;
    }
  }

  async refreshForAdmin(): Promise<void> {
    const businessId = this.authService.user()?.id;
    if (!businessId) {
      this.notificationsState.set([]);
      this.unreadNotificationCountState.set(0);
      return;
    }

    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      const [notificationList, notificationCount] = await Promise.all([
        listAdminNotifications({ businessId }),
        getUnreadNotificationCount(businessId),
      ]);

      this.notificationsState.set(notificationList);
      this.unreadNotificationCountState.set(notificationCount);
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones');
      this.notificationsState.set([]);
      this.unreadNotificationCountState.set(0);
    } finally {
      this.loadingState.set(false);
    }
  }

  async clearAll(): Promise<void> {
    const businessId = this.authService.user()?.id;
    if (!businessId) return;

    // Optimistic update
    this.notificationsState.set([]);
    this.unreadNotificationCountState.set(0);

    try {
      await archiveAllNotifications(businessId);
    } catch (error) {
      console.error('Failed to archive notifications:', error);
      this.errorState.set('No se pudieron archivar las notificaciones en el servidor');
      await this.refreshForAdmin(); // Revert on error
    }
  }

  async readNotification(notificationId: string): Promise<void> {
    try {
      const updated = await markNotificationRead(notificationId);
      this.notificationsState.update((notificationList) =>
        notificationList.map((notification) => notification.id === notificationId ? updated : notification),
      );
      this.unreadNotificationCountState.update((count) => Math.max(0, count - 1));
    } catch (error) {
      console.error('Error reading notification:', error);
    }
  }

  async archiveAdminNotification(notificationId: string): Promise<void> {
    try {
      await archiveNotification(notificationId);
      this.notificationsState.update((notificationList) =>
        notificationList.filter((notification) => notification.id !== notificationId),
      );
      await this.refreshForAdmin();
    } catch (error) {
      console.error('Error archiving notification:', error);
    }
  }
}
