// @vitest-environment jsdom

import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';
import type { DashboardNotification } from './internal-dashboard-notifications.api';

const BUSINESS_ID = 'business-real-1';

const mocks = vi.hoisted(() => ({
  branchContext: {
    getActiveBusinessId: vi.fn()
  },
  listAdminNotifications: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
  archiveAllNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  archiveNotification: vi.fn(),
  emitPublicBookingFailureEvent: vi.fn(),
  channel: vi.fn(),
  channelOn: vi.fn(),
  registerSectionCacheInvalidator: vi.fn()
}));

vi.mock('../branches/branch-context.service', () => ({
  getBranchContextService: () => mocks.branchContext,
  registerSectionCacheInvalidator: (invalidate: () => void) => mocks.registerSectionCacheInvalidator(invalidate),
  invalidateSectionCaches: () => undefined
}));

vi.mock('./internal-dashboard-notifications.api', () => ({
  listAdminNotifications: mocks.listAdminNotifications,
  getUnreadNotificationCount: mocks.getUnreadNotificationCount,
  archiveAllNotifications: mocks.archiveAllNotifications,
  markNotificationRead: mocks.markNotificationRead,
  archiveNotification: mocks.archiveNotification
}));

vi.mock('../runtime/supabase-client', () => ({
  createSupabaseClient: () => ({
    channel: (...args: unknown[]) => mocks.channel(...args)
  })
}));

vi.mock('../observability/public-booking-operational-events', () => ({
  emitPublicBookingFailureEvent: mocks.emitPublicBookingFailureEvent
}));

function notification(partial: Partial<DashboardNotification> & Pick<DashboardNotification, 'id' | 'status'>): DashboardNotification {
  return {
    eventType: 'appointment.created',
    businessId: BUSINESS_ID,
    appointmentId: `appt-${partial.id}`,
    title: `Title ${partial.id}`,
    body: `Body ${partial.id}`,
    createdAt: partial.createdAt ?? '2026-08-27T10:00:00.000Z',
    readAt: partial.status === 'read' ? '2026-08-27T11:00:00.000Z' : null,
    archivedAt: null,
    ...partial
  };
}

async function createService(): Promise<InstanceType<typeof import('./dashboard-notifications.service').DashboardNotificationsService>> {
  const { DashboardNotificationsService } = await import('./dashboard-notifications.service');
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      DashboardNotificationsService,
      { provide: AuthService, useValue: { user: () => ({ id: 'auth-user-1' }) } }
    ]
  });
  return TestBed.inject(DashboardNotificationsService);
}

function realtimeHandler(): () => void {
  const call = mocks.channelOn.mock.calls.find((entry) => entry[0] === 'postgres_changes');
  expect(call, 'realtime postgres_changes handler').toBeTruthy();
  return call![2] as () => void;
}

describe('Dashboard notifications once per shell', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.branchContext.getActiveBusinessId.mockResolvedValue(BUSINESS_ID);
    mocks.listAdminNotifications.mockResolvedValue([]);
    mocks.getUnreadNotificationCount.mockResolvedValue(99);
    mocks.archiveAllNotifications.mockResolvedValue(undefined);
    mocks.archiveNotification.mockResolvedValue(notification({ id: 'archived', status: 'archived' }));
    mocks.channel.mockImplementation(() => {
      const channel = {
        on: (...args: unknown[]) => {
          mocks.channelOn(...args);
          return channel;
        },
        subscribe: vi.fn(),
        unsubscribe: vi.fn()
      };
      return channel;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('issues one list GET and zero unread HEAD on first refreshForAdmin/init', async () => {
    const service = await createService();
    await service.refreshForAdmin();

    expect(mocks.listAdminNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.listAdminNotifications).toHaveBeenCalledWith(expect.objectContaining({ businessId: BUSINESS_ID }));
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('derives unread badge from unread rows already in the list', async () => {
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'n1', status: 'unread' }),
      notification({ id: 'n2', status: 'read' }),
      notification({ id: 'n3', status: 'unread' })
    ]);

    const service = await createService();
    await service.refreshForAdmin();

    expect(service.unreadNotificationCount()).toBe(2);
    expect(service.notificationsUnread()).toBe(true);
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('skips a second full refresh when the list is already loaded for the same businessId', async () => {
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'n1', status: 'unread' })
    ]);

    const service = await createService();
    await service.refreshForAdmin();
    await service.refreshForAdmin();

    expect(mocks.listAdminNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
    expect(service.notifications()).toHaveLength(1);
  });

  it('still fetches the next page when loadMore supplies a cursor', async () => {
    mocks.listAdminNotifications
      .mockResolvedValueOnce([
        notification({ id: 'n1', status: 'unread', createdAt: '2026-08-27T12:00:00.000Z' })
      ])
      .mockResolvedValueOnce([
        notification({ id: 'n2', status: 'unread', createdAt: '2026-08-27T11:00:00.000Z' }),
        notification({ id: 'n3', status: 'read', createdAt: '2026-08-27T10:00:00.000Z' })
      ]);

    const service = await createService();
    await service.refreshForAdmin();
    service.loadMore();
    await vi.waitFor(() => expect(mocks.listAdminNotifications).toHaveBeenCalledTimes(2));

    expect(mocks.listAdminNotifications).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        businessId: BUSINESS_ID,
        cursor: '2026-08-27T12:00:00.000Z',
        cursorId: 'n1'
      })
    );
    expect(service.notifications()).toHaveLength(3);
    expect(service.unreadNotificationCount()).toBe(2);
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
  });

  it('coalesces a realtime burst into one forced refresh', async () => {
    const service = await createService();
    await service.refreshForAdmin();
    const handler = realtimeHandler();
    mocks.listAdminNotifications.mockClear();
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'live', status: 'unread' })
    ]);

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    handler();
    handler();
    await vi.advanceTimersByTimeAsync(200);
    handler();
    handler();
    expect(mocks.listAdminNotifications).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(500);

    expect(mocks.listAdminNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
    expect(service.unreadNotificationCount()).toBe(1);
  });

  it('archiveAdminNotification drops that id from the visible list and unread count', async () => {
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'n1', status: 'unread' }),
      notification({ id: 'n2', status: 'read' })
    ]);
    const service = await createService();
    await service.refreshForAdmin();
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'n2', status: 'read' })
    ]);

    await service.archiveAdminNotification('n1');

    expect(mocks.archiveNotification).toHaveBeenCalledWith('n1');
    expect(service.notifications().map((item) => item.id)).toEqual(['n2']);
    expect(service.unreadNotificationCount()).toBe(0);
  });

  it('still refreshes after archiveAdminNotification and clearAll error', async () => {
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'n1', status: 'unread' })
    ]);
    const service = await createService();
    await service.refreshForAdmin();
    mocks.listAdminNotifications.mockClear();
    mocks.listAdminNotifications.mockResolvedValue([]);

    await service.archiveAdminNotification('n1');
    expect(mocks.listAdminNotifications).toHaveBeenCalledTimes(1);

    mocks.listAdminNotifications.mockClear();
    mocks.archiveAllNotifications.mockRejectedValueOnce(new Error('archive failed'));
    mocks.listAdminNotifications.mockResolvedValue([
      notification({ id: 'n1', status: 'unread' })
    ]);

    await service.clearAll();
    expect(mocks.listAdminNotifications).toHaveBeenCalledTimes(1);
    expect(mocks.getUnreadNotificationCount).not.toHaveBeenCalled();
  });
});
