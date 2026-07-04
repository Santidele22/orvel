// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Injector, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';

const OWNER_ID = 'owner-verified-001';
const VERIFIED_BUSINESS_ID = 'business-verified-001';
const FORGED_BUSINESS_ID = 'business-forged-999';
const BRANCH_ID = 'branch-verified-001';
const BOOKING_ID = 'booking-verified-001';

type SupabaseDouble = ReturnType<typeof createSupabaseDouble>;

function createSupabaseDouble(options: { branches?: unknown[]; branchRpcError?: boolean } = {}) {
  const channelFilters: string[] = [];
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const branches = options.branches ?? [{ id: BRANCH_ID, name: 'Central', business_id: VERIFIED_BUSINESS_ID, is_active: true }];

  return {
    channelFilters,
    rpcCalls,
    auth: {
      getSession: vi.fn().mockResolvedValue({
        data: { session: { user: { id: OWNER_ID, user_metadata: { businessId: FORGED_BUSINESS_ID, business_id: FORGED_BUSINESS_ID } } } },
        error: null,
      }),
    },
    from: vi.fn(() => ({
      insert: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: null, error: null }) })) })),
    })),
    channel: vi.fn(() => ({
      on: vi.fn((_event: string, config: { filter?: string }) => {
        if (config.filter) channelFilters.push(config.filter);
        return { subscribe: vi.fn(() => undefined) };
      }),
    })),
    rpc: vi.fn((fn: string, args: Record<string, unknown> = {}) => {
      rpcCalls.push({ fn, args });
      if (fn === 'get_dashboard_branches') {
        return Promise.resolve(options.branchRpcError
          ? { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.get_dashboard_branches' } }
          : { data: branches, error: null });
      }
      if (fn === 'list_admin_bookings') {
        return Promise.resolve({
          data: [{
            id: BOOKING_ID,
            branch_id: BRANCH_ID,
            customer_id: 'customer-verified-001',
            service_id: 'service-verified-001',
            starts_at: '2035-01-15T13:00:00.000Z',
            ends_at: '2035-01-15T13:30:00.000Z',
            status: 'booked',
            notes: 'Verified tenant booking',
            created_at: '2035-01-01T00:00:00.000Z',
            updated_at: '2035-01-01T00:00:00.000Z',
          }],
          error: null,
        });
      }
      if (fn === 'create_admin_manual_booking') {
        return Promise.resolve({ data: { booking_id: 'booking-created-001', status: 'booked' }, error: null });
      }

      return Promise.resolve({ data: null, error: null });
    }),
  };
}

function installDashboardClientMock(supabase: SupabaseDouble): void {
  vi.doMock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => supabase) }));
  vi.doMock('../../core/runtime/dashboard-env', () => ({
    loadDashboardRuntimeEnv: () => ({ NEXT_PUBLIC_SUPABASE_URL: 'https://orvel.test', NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key' }),
  }));
}

function installNotificationClientMock(supabase: SupabaseDouble, api: Record<string, unknown> = {}): void {
  vi.doMock('../../core/api/supabase-booking/real-gateway', () => ({ createSupabaseClient: vi.fn(() => supabase) }));
  vi.doMock('../../core/notifications/internal-dashboard-notifications.api', () => ({
    archiveNotification: vi.fn(() => Promise.resolve({ id: 'archived' })),
    getUnreadNotificationCount: vi.fn(() => Promise.resolve(0)),
    listAdminNotifications: vi.fn(() => Promise.resolve([])),
    markNotificationRead: vi.fn(),
    ...api,
  }));
}

async function createTurnoService(supabase: SupabaseDouble) {
  vi.doMock('../../services/auth.service', () => ({ AuthService: class AuthService {} }));
  vi.doMock('../../core/observability/public-booking-operational-events', () => ({ emitPublicBookingFailureEvent: vi.fn() }));
  const { AuthService } = await import('../../services/auth.service');
  const { TurnoService } = await import('../../features/booking/data-access/turno.service');
  const injector = Injector.create({ providers: [{ provide: AuthService, useValue: { user: () => ({ id: OWNER_ID }) } }] });
  const service = runInInjectionContext(injector, () => new TurnoService()) as any;
  service.supabaseClient = supabase;
  service.setProvider('supabase');
  return service;
}

describe('verified dashboard business context', () => {
  beforeEach(() => vi.resetModules());

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('loads branch context through backend-owned RPC results instead of forged metadata or public table reads', async () => {
    const supabase = createSupabaseDouble();
    installDashboardClientMock(supabase);

    const { BranchContextService } = await import('../../core/branches/branch-context.service');
    const service = new BranchContextService();
    await service.refresh();

    expect(supabase.rpc).toHaveBeenCalledWith('get_dashboard_branches');
    expect(supabase.from).not.toHaveBeenCalledWith('businesses');
    expect(supabase.from).not.toHaveBeenCalledWith('branches');
    expect(service.branches()).toEqual([{ id: BRANCH_ID, name: 'Central', businessId: VERIFIED_BUSINESS_ID }]);
    expect(service.branches().some((branch) => branch.businessId === FORGED_BUSINESS_ID)).toBe(false);
  });

  it('fails visible branch setup when the backend-owned RPC returns no ownership proof or fails', async () => {
    for (const supabase of [createSupabaseDouble({ branches: [] }), createSupabaseDouble({ branchRpcError: true })]) {
      vi.resetModules();
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      installDashboardClientMock(supabase);

      const { BranchContextService } = await import('../../core/branches/branch-context.service');
      const service = new BranchContextService();
      await service.refresh();

      expect(service.branches()).toEqual([]);
      expect(service.activeBranchId()).toBeNull();
      expect(service.error()).toMatch(/sucursales|RPC|cuenta/i);
    }
  });

  it('uses verified business context for notification list/count/subscribe and ignores forged metadata', async () => {
    const supabase = createSupabaseDouble();
    const listAdminNotifications = vi.fn(() => Promise.resolve([]));
    const getUnreadNotificationCount = vi.fn(() => Promise.resolve(0));
    installNotificationClientMock(supabase, { listAdminNotifications, getUnreadNotificationCount });

    const { DashboardNotificationsService } = await import('../../core/notifications/dashboard-notifications.service');
    const service = new DashboardNotificationsService();
    await service.refreshForAdmin();

    expect(listAdminNotifications).toHaveBeenCalledWith({ businessId: VERIFIED_BUSINESS_ID });
    expect(getUnreadNotificationCount).toHaveBeenCalledWith(VERIFIED_BUSINESS_ID);
    expect(listAdminNotifications).not.toHaveBeenCalledWith({ businessId: FORGED_BUSINESS_ID });
    await vi.waitFor(() => expect(supabase.channelFilters).toContain(`business_id=eq.${VERIFIED_BUSINESS_ID}`));
    expect(supabase.channelFilters).not.toContain(`business_id=eq.${FORGED_BUSINESS_ID}`);
  });

  it('keeps notification setup and clear-all context failures observable without rejecting or leaking raw errors', async () => {
    const supabase = createSupabaseDouble({ branchRpcError: true });
    const archiveNotification = vi.fn(() => Promise.resolve({ id: 'archived' }));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    installNotificationClientMock(supabase, { archiveNotification });

    const { DashboardNotificationsService } = await import('../../core/notifications/dashboard-notifications.service');
    const service = new DashboardNotificationsService() as any;
    service.notificationsState.set([{ id: 'notification-owned', status: 'unread', eventType: 'appointment.created', businessId: VERIFIED_BUSINESS_ID, appointmentId: 'booking-1', title: 'Owned', body: 'Owned notification', createdAt: '2026-07-01T00:00:00.000Z' }]);
    service.unreadNotificationCountState.set(1);

    await expect(service.refreshForAdmin()).resolves.toBeUndefined();
    await expect(service.clearAll()).resolves.toBeUndefined();

    expect(archiveNotification).not.toHaveBeenCalled();
    expect(service.notifications()).toEqual([]);
    expect(service.unreadNotificationCount()).toBe(0);
    expect(service.error()).toMatch(/configuración de notificaciones|RPC/i);
    expect(console.warn).toHaveBeenCalledWith('[Notifications] Verified dashboard branch context failed', { code: 'DASHBOARD_BRANCH_RPC_FAILED' });
  });

  it('archives only loaded notifications from the verified business and never calls archive-all RPC', async () => {
    const supabase = createSupabaseDouble();
    const archiveNotification = vi.fn(() => Promise.resolve({ id: 'archived' }));
    installNotificationClientMock(supabase, { archiveNotification });

    const { DashboardNotificationsService } = await import('../../core/notifications/dashboard-notifications.service');
    const service = new DashboardNotificationsService() as any;
    service.notificationsState.set([
      { id: 'notification-owned', status: 'unread', eventType: 'appointment.created', businessId: VERIFIED_BUSINESS_ID, appointmentId: 'booking-1', title: 'Owned', body: 'Owned notification', createdAt: '2026-07-01T00:00:00.000Z' },
      { id: 'notification-cross-tenant', status: 'unread', eventType: 'appointment.created', businessId: FORGED_BUSINESS_ID, appointmentId: 'booking-2', title: 'Other', body: 'Other notification', createdAt: '2026-07-01T00:00:00.000Z' },
    ]);

    await service.clearAll();

    expect(archiveNotification).toHaveBeenCalledWith('notification-owned');
    expect(archiveNotification).not.toHaveBeenCalledWith('notification-cross-tenant');
    expect(supabase.rpcCalls).not.toContainEqual({ fn: 'archive_all_dashboard_notifications', args: { p_business_id: VERIFIED_BUSINESS_ID } });
  });

  it('loads and creates TurnoService bookings with backend-owned branch/business context despite forged metadata', async () => {
    const supabase = createSupabaseDouble();
    window.localStorage.setItem('activeBranchId', BRANCH_ID);
    const service = await createTurnoService(supabase);

    const turnos = await firstValueFrom(service.getAll());
    await firstValueFrom(service.create({ branchId: BRANCH_ID, clienteId: 'customer-verified-001', servicioId: 'service-verified-001', fecha: new Date('2035-01-16T12:00:00.000Z'), hora: '10:00', duracionMinutos: 30, estado: 'confirmado', precio: 0 }));

    expect(turnos).toHaveLength(1);
    expect(supabase.rpcCalls).toContainEqual({ fn: 'get_dashboard_branches', args: {} });
    expect(supabase.rpcCalls).toContainEqual({ fn: 'list_admin_bookings', args: { p_branch_id: BRANCH_ID } });
    expect(supabase.rpcCalls.find((call) => call.fn === 'create_admin_manual_booking')?.args).toMatchObject({ business_id: VERIFIED_BUSINESS_ID, branch_id: BRANCH_ID });
    expect(supabase.rpcCalls.map((call) => call.args)).not.toContainEqual(expect.objectContaining({ business_id: FORGED_BUSINESS_ID }));
  });

  it('fails closed before TurnoService admin writes when backend-owned branch context cannot be resolved', async () => {
    const supabase = createSupabaseDouble({ branches: [] });
    const service = await createTurnoService(supabase);

    await expect(firstValueFrom(service.create({ branchId: BRANCH_ID, clienteId: 'customer-verified-001', servicioId: 'service-verified-001', fecha: new Date('2035-01-16T12:00:00.000Z'), hora: '10:00', duracionMinutos: 30, estado: 'confirmado', precio: 0 }))).rejects.toThrow(/BRANCH_NOT_FOUND|ACCOUNT_SETUP_REQUIRED|INVALID_BRANCH/);

    expect(supabase.rpcCalls.some((call) => call.fn === 'create_admin_manual_booking')).toBe(false);
    expect(supabase.from).not.toHaveBeenCalledWith('branches');
  });
});
