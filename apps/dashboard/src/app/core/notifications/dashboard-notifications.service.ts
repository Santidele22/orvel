import { Injectable, computed, signal, OnDestroy } from '@angular/core';
import { createSupabaseClient } from '../api/supabase-booking/real-gateway';
import {
  archiveNotification,
  getUnreadNotificationCount,
  listAdminNotifications,
  markNotificationRead,
  type DashboardNotification,
} from './internal-dashboard-notifications.api';
import { RealtimeChannel } from '@supabase/supabase-js';
import { DashboardBranchContextError, resolveVerifiedDashboardBusinessId } from '../business/verified-dashboard-business-context';

@Injectable({ providedIn: 'root' })
export class DashboardNotificationsService implements OnDestroy {
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
    try {
      const businessId = await this.resolveDashboardBusinessId();
      if (businessId) {
        await this.refreshForAdmin();
        this.startSubscription(businessId);
      }
    } catch (error) {
      this.handleDashboardBusinessResolutionError(error);
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
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      const businessId = await this.resolveDashboardBusinessId();
      if (!businessId) {
        this.notificationsState.set([]);
        this.unreadNotificationCountState.set(0);
        return;
      }

      const [notificationList, notificationCount] = await Promise.all([
        listAdminNotifications({ businessId }),
        getUnreadNotificationCount(businessId),
      ]);

      this.notificationsState.set(notificationList);
      this.unreadNotificationCountState.set(notificationCount);
    } catch (error) {
      this.handleDashboardBusinessResolutionError(error);
      this.notificationsState.set([]);
      this.unreadNotificationCountState.set(0);
    } finally {
      this.loadingState.set(false);
    }
  }

  async clearAll(): Promise<void> {
    try {
      const businessId = await this.resolveDashboardBusinessId();
      if (!businessId) return;
      const notificationsToArchive = this.notificationsState()
        .filter((notification) => notification.businessId === businessId && notification.status !== 'archived');
      if (notificationsToArchive.length === 0) return;

      // Optimistic update
      this.notificationsState.update((notificationList) =>
        notificationList.filter((notification) => notification.businessId !== businessId),
      );
      this.unreadNotificationCountState.set(0);

      await Promise.all(notificationsToArchive.map((notification) => archiveNotification(notification.id)));
    } catch (error) {
      if (error instanceof DashboardBranchContextError) {
        this.handleDashboardBusinessResolutionError(error);
        this.notificationsState.set([]);
        this.unreadNotificationCountState.set(0);
        return;
      }

      console.warn('[Notifications] Failed to archive notifications', { code: this.sanitizeErrorCode(error) });
      this.errorState.set('No se pudieron archivar las notificaciones en el servidor');
      await this.refreshForAdmin(); // Revert on error
    }
  }

  private sanitizeErrorCode(error: unknown): string {
    const code = typeof (error as { code?: unknown } | null)?.code === 'string'
      ? (error as { code: string }).code
      : error instanceof Error
        ? error.name
        : 'UNKNOWN';

    return code.trim().toUpperCase().replace(/[^A-Z0-9_:-]/g, '_').slice(0, 64) || 'UNKNOWN';
  }

  private async resolveDashboardBusinessId(): Promise<string | null> {
    const supabase = createSupabaseClient();
    return resolveVerifiedDashboardBusinessId(supabase);
  }

  private handleDashboardBusinessResolutionError(error: unknown): void {
    if (error instanceof DashboardBranchContextError) {
      console.warn('[Notifications] Verified dashboard branch context failed', { code: error.code });
      this.errorState.set('No pudimos verificar la configuración de notificaciones. Revisá la conexión o la publicación del RPC.');
      return;
    }

    this.errorState.set(error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones');
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
