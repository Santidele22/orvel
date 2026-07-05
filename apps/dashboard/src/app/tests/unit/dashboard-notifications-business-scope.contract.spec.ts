// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../services/auth.service';

const appRoot = resolve(process.cwd(), 'src/app');

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
  channel: vi.fn()
}));

vi.mock('../../core/branches/branch-context.service', () => ({
  getBranchContextService: () => mocks.branchContext
}));

vi.mock('../../core/notifications/internal-dashboard-notifications.api', () => ({
  listAdminNotifications: mocks.listAdminNotifications,
  getUnreadNotificationCount: mocks.getUnreadNotificationCount,
  archiveAllNotifications: mocks.archiveAllNotifications,
  markNotificationRead: mocks.markNotificationRead,
  archiveNotification: mocks.archiveNotification
}));

vi.mock('../../core/api/supabase-booking/real-gateway', () => ({
  createSupabaseClient: () => ({
    channel: mocks.channel.mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    })
  })
}));

vi.mock('../../core/observability/public-booking-operational-events', () => ({
  emitPublicBookingFailureEvent: mocks.emitPublicBookingFailureEvent
}));

async function flushAsyncWork(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe('Dashboard notification business scope contract', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listAdminNotifications.mockResolvedValue([]);
    mocks.getUnreadNotificationCount.mockResolvedValue(0);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('uses the resolved dashboard business id for notification reads instead of the auth user id', async () => {
    const { DashboardNotificationsService } = await import('../../core/notifications/dashboard-notifications.service');
    mocks.branchContext.getActiveBusinessId.mockResolvedValue('business-real-1');

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DashboardNotificationsService,
        { provide: AuthService, useValue: { user: () => ({ id: 'auth-user-1' }) } }
      ]
    });

    const service = TestBed.inject(DashboardNotificationsService);
    await service.refreshForAdmin();

    expect(mocks.listAdminNotifications).toHaveBeenCalledWith({ businessId: 'business-real-1' });
    expect(mocks.getUnreadNotificationCount).toHaveBeenCalledWith('business-real-1');
    expect(mocks.listAdminNotifications).not.toHaveBeenCalledWith({ businessId: 'auth-user-1' });
  });

  it('emits sanitized operational telemetry when business context is missing', async () => {
    const { DashboardNotificationsService } = await import('../../core/notifications/dashboard-notifications.service');
    mocks.branchContext.getActiveBusinessId.mockResolvedValue(null);

    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        DashboardNotificationsService,
        { provide: AuthService, useValue: { user: () => ({ id: 'auth-user-1' }) } }
      ]
    });

    const service = TestBed.inject(DashboardNotificationsService);
    await flushAsyncWork();

    expect(service.notifications()).toEqual([]);
    expect(service.unreadNotificationCount()).toBe(0);
    expect(service.error()).toContain('No se pudo resolver el negocio activo');
    expect(mocks.emitPublicBookingFailureEvent).toHaveBeenCalledWith({
      stage: 'service',
      code: 'DASHBOARD_NOTIFICATIONS_BUSINESS_CONTEXT_MISSING',
      status: 409,
      retryable: true
    });
  });

  it('resolves the bell scope from dashboard business context, not the auth user id', () => {
    const source = readFileSync(resolve(appRoot, 'core/notifications/dashboard-notifications.service.ts'), 'utf8');
    const branchContext = readFileSync(resolve(appRoot, 'core/branches/branch-context.service.ts'), 'utf8');

    expect(source).toMatch(/getBranchContextService/);
    expect(source).toMatch(/getActiveBusinessId\(\)/);
    expect(source).toMatch(/listAdminNotifications\(\{ businessId \}\)/);
    expect(source).toMatch(/getUnreadNotificationCount\(businessId\)/);
    expect(source).toMatch(/archiveAllNotifications\(businessId\)/);
    expect(source).not.toMatch(/const\s+businessId\s*=\s*this\.authService\.user\(\)\?\.id/);
    expect(branchContext).toMatch(/async getActiveBusinessId\(\)/);
    expect(branchContext).toMatch(/ACTIVE_BUSINESS_STORAGE_KEY/);
  });

  it('fails degraded-empty when no active business can be resolved', () => {
    const source = readFileSync(resolve(appRoot, 'core/notifications/dashboard-notifications.service.ts'), 'utf8');

    expect(source).toMatch(/applyMissingBusinessContext/);
    expect(source).toMatch(/notificationsState\.set\(\[\]\)/);
    expect(source).toMatch(/unreadNotificationCountState\.set\(0\)/);
    expect(source).toMatch(/stopSubscription\(\)/);
    expect(source).toMatch(/No se pudo resolver el negocio activo/);
  });
});
