import { Injectable, computed, signal, inject, OnDestroy } from '@angular/core';
import { AuthService } from '../../services/auth.service';
import { createSupabaseClient } from '../runtime/supabase-client';
import {
  archiveNotification,
  listAdminNotifications,
  markNotificationRead,
  archiveAllNotifications,
  type DashboardNotification,
} from './internal-dashboard-notifications.api';
import { RealtimeChannel } from '@supabase/supabase-js';
import { getBranchContextService, registerSectionCacheInvalidator } from '../branches/branch-context.service';
import { emitPublicBookingFailureEvent } from '../observability/public-booking-operational-events';

const REALTIME_REFRESH_DEBOUNCE_MS = 400;

function unreadCountFromList(items: readonly DashboardNotification[]): number {
  return items.filter((item) => item.status === 'unread').length;
}

@Injectable({ providedIn: 'root' })
export class DashboardNotificationsService implements OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly branchContext = getBranchContextService();
  private readonly notificationsState = signal<DashboardNotification[]>([]);
  private readonly unreadNotificationCountState = signal(0);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private subscription: RealtimeChannel | null = null;
  private subscribedBusinessId: string | null = null;
  private loadedBusinessId: string | null = null;
  private inFlightRefresh: Promise<void> | null = null;
  private realtimeRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  readonly notifications = this.notificationsState.asReadonly();
  readonly unreadNotificationCount = this.unreadNotificationCountState.asReadonly();
  readonly notificationsUnread = computed(() => this.unreadNotificationCountState() > 0);
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  constructor() {
    registerSectionCacheInvalidator(() => this.clearCache());
    void this.init();
  }

  ngOnDestroy(): void {
    this.stopSubscription();
    this.clearRealtimeRefreshTimer();
  }

  private async init() {
    const businessId = await this.resolveBusinessId();
    if (businessId) {
      await this.refreshForAdmin();
    } else {
      this.applyMissingBusinessContext();
    }
  }

  private startSubscription(businessId: string) {
    if (this.subscribedBusinessId === businessId && this.subscription) {
      return;
    }
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
          this.scheduleRealtimeRefresh();
        }
      )
      .subscribe();
    this.subscribedBusinessId = businessId;
  }

  private scheduleRealtimeRefresh(): void {
    this.clearRealtimeRefreshTimer();
    this.realtimeRefreshTimer = setTimeout(() => {
      this.realtimeRefreshTimer = null;
      void this.refreshForAdmin(undefined, { force: true });
    }, REALTIME_REFRESH_DEBOUNCE_MS);
  }

  private clearRealtimeRefreshTimer(): void {
    if (this.realtimeRefreshTimer) {
      clearTimeout(this.realtimeRefreshTimer);
      this.realtimeRefreshTimer = null;
    }
  }

  private stopSubscription() {
    if (this.subscription) {
      void this.subscription.unsubscribe();
      this.subscription = null;
    }
    this.subscribedBusinessId = null;
    this.clearRealtimeRefreshTimer();
  }

  private clearCache(): void {
    this.loadedBusinessId = null;
    this.inFlightRefresh = null;
    this.notificationsState.set([]);
    this.unreadNotificationCountState.set(0);
    this.stopSubscription();
  }

  private syncUnreadFromList(): void {
    this.unreadNotificationCountState.set(unreadCountFromList(this.notificationsState()));
  }

  async refreshForAdmin(
    cursor?: { createdAt: string; id: string },
    options?: { force?: boolean },
  ): Promise<void> {
    const businessId = await this.resolveBusinessId();
    if (!businessId) {
      this.applyMissingBusinessContext();
      return;
    }

    const force = options?.force === true;
    if (!cursor && !force && this.loadedBusinessId === businessId) {
      return;
    }
    if (!cursor && !force && this.inFlightRefresh) {
      return this.inFlightRefresh;
    }

    const work = this.fetchNotifications(businessId, cursor);
    if (!cursor) {
      this.inFlightRefresh = work.finally(() => {
        this.inFlightRefresh = null;
      });
      return this.inFlightRefresh;
    }
    return work;
  }

  private async fetchNotifications(
    businessId: string,
    cursor?: { createdAt: string; id: string },
  ): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);

    try {
      const notificationList = await listAdminNotifications({
        businessId,
        ...(cursor ? { cursor: cursor.createdAt, cursorId: cursor.id } : {}),
      });

      if (cursor) {
        this.notificationsState.update((existing) => [...existing, ...notificationList]);
      } else {
        this.notificationsState.set(notificationList);
        this.loadedBusinessId = businessId;
      }
      this.syncUnreadFromList();
    } catch (error) {
      this.errorState.set(error instanceof Error ? error.message : 'No se pudieron cargar las notificaciones');
      if (!cursor) {
        this.loadedBusinessId = null;
        this.notificationsState.set([]);
        this.unreadNotificationCountState.set(0);
      }
    } finally {
      this.loadingState.set(false);
    }

    if (!cursor && this.loadedBusinessId === businessId) {
      this.startSubscription(businessId);
    }
  }

  /**
   * Loads the next page of notifications using cursor-based pagination.
   * The cursor is derived from the last loaded notification (createdAt + id).
   */
  loadMore(): void {
    const current = this.notificationsState();
    if (current.length === 0) return;

    const last = current[current.length - 1];
    void this.refreshForAdmin({ createdAt: last.createdAt, id: last.id });
  }

  async clearAll(): Promise<void> {
    const businessId = await this.resolveBusinessId();
    if (!businessId) {
      this.applyMissingBusinessContext();
      return;
    }

    this.notificationsState.set([]);
    this.unreadNotificationCountState.set(0);

    try {
      await archiveAllNotifications(businessId);
    } catch (error) {
      console.error('Failed to archive notifications:', error);
      this.errorState.set('No se pudieron archivar las notificaciones en el servidor');
      await this.refreshForAdmin(undefined, { force: true });
    }
  }

  async readNotification(notificationId: string): Promise<void> {
    try {
      const updated = await markNotificationRead(notificationId);
      this.notificationsState.update((notificationList) =>
        notificationList.map((notification) => notification.id === notificationId ? updated : notification),
      );
      this.syncUnreadFromList();
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
      this.syncUnreadFromList();
      await this.refreshForAdmin(undefined, { force: true });
    } catch (error) {
      console.error('Error archiving notification:', error);
    }
  }

  private async resolveBusinessId(): Promise<string | null> {
    if (!this.authService.user()?.id) return null;
    return this.branchContext.getActiveBusinessId();
  }

  private applyMissingBusinessContext(): void {
    emitPublicBookingFailureEvent({
      stage: 'service',
      code: 'DASHBOARD_NOTIFICATIONS_BUSINESS_CONTEXT_MISSING',
      status: 409,
      retryable: true
    });
    this.stopSubscription();
    this.loadedBusinessId = null;
    this.notificationsState.set([]);
    this.unreadNotificationCountState.set(0);
    this.loadingState.set(false);
    this.errorState.set('No se pudo resolver el negocio activo para cargar notificaciones.');
  }
}
