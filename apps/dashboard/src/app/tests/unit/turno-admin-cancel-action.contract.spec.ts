// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingNotificationsService,
  BookingSchedulingService
} from '@orvel/booking/application';
import { TurnoService } from '../../features/booking/data-access/turno.facade';
import { getBranchContextService } from '../../core/branches/branch-context.service';
import type { Turno, TurnoWithRelations } from '../../features/booking/models/turno.model';
import { TurnosListPage } from '../../features/booking/pages/turnos-list.page';
import { AuthService } from '../../services/auth.service';
import { MockNotificationService } from '../../services/notification.service';
import { ACTIVE_BRANCH_STORAGE_KEY } from '../../core/storage/browser-storage-keys';
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { ThemeService } from '../../core/theming/theme.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { Router } from '@angular/router';

const BUSINESS_ID = 'biz-admin-cancel-001';
const BRANCH_ID = 'branch-admin-cancel-001';
const ADMIN_ID = 'admin-admin-cancel-001';
const BOOKING_ID = 'booking-admin-cancel-001';

function createSupabaseClientDouble() {
  const rpcCalls: Array<{ fn: string; args: Record<string, unknown> }> = [];

  const branchBuilder = {
    select: () => branchBuilder,
    eq: () => branchBuilder,
    maybeSingle: () => Promise.resolve({
      data: { id: BRANCH_ID, business_id: BUSINESS_ID },
      error: null
    })
  };

  return {
    rpcCalls,
    auth: {
      getSession: () => Promise.resolve({
        data: {
          session: {
            user: {
              id: ADMIN_ID,
              user_metadata: { businessId: BUSINESS_ID }
            }
          }
        },
        error: null
      })
    },
    from: () => branchBuilder,
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });

      if (fn === 'assert_admin_booking_in_branch') {
        return Promise.resolve({ data: { booking_id: BOOKING_ID }, error: null });
      }

      if (fn === 'cancel_admin_booking') {
        if (args['branch_id'] !== BRANCH_ID) {
          return Promise.resolve({ data: null, error: { message: 'UNAUTHORIZED' } });
        }

        return Promise.resolve({
          data: {
            booking_id: args['booking_id'],
            status: 'cancelled',
            updated_at: '2035-01-15T12:30:00.000Z'
          },
          error: null
        });
      }

      if (fn === 'record_admin_booking_cancel_failure') {
        return Promise.resolve({ data: null, error: null });
      }

      return Promise.resolve({ data: null, error: { message: `Unexpected RPC ${fn}` } });
    }
  };
}

function createServiceWithSupabaseDouble() {
  const authService = {
    user: () => ({ id: ADMIN_ID, activeBranchId: BRANCH_ID })
  };
  const supabase = createSupabaseClientDouble();
  const crud = {
    cancelByAdmin: async (id: string, payload: { branchId: string }) => {
      const result = await supabase.rpc('cancel_admin_booking', { booking_id: id, branch_id: payload.branchId });
      if (result.error) throw new Error(result.error.message);
      return result.data;
    }
  };
  const notifications = {
    recordAdminCancelFailureTelemetry: async (input: { stage: string; code: unknown }) => {
      await supabase.rpc('record_admin_booking_cancel_failure', { p_stage: input.stage, p_code: input.code });
    }
  };
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: authService },
      { provide: BookingCrudService, useValue: crud },
      { provide: BookingNotificationsService, useValue: notifications }
    ]
  });
  const service = runInInjectionContext(injector, () => new TurnoService());
  (service as unknown as { supabaseClient: unknown }).supabaseClient = supabase;
  (service as unknown as { turnos: { set: (turnos: Turno[]) => void } }).turnos.set([
    {
      id: BOOKING_ID,
      branchId: BRANCH_ID,
      clienteId: 'cust-admin-cancel-001',
      servicioId: 'svc-admin-cancel-001',
      fecha: new Date('2035-01-15T00:00:00.000Z'),
      hora: '09:30',
      duracionMinutos: 30,
      estado: 'confirmado',
      notas: 'Original notes',
      precio: 0,
      createdAt: new Date('2035-01-01T00:00:00.000Z'),
      updatedAt: new Date('2035-01-01T00:00:00.000Z')
    }
  ]);

  return { service, supabase };
}

describe('Admin turno cancel action contract', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2035-01-15T12:00:00.000Z'));
    window.localStorage.setItem(ACTIVE_BRANCH_STORAGE_KEY, BRANCH_ID);
  });

  afterEach(() => {
    window.localStorage.removeItem(ACTIVE_BRANCH_STORAGE_KEY);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('soft-cancels through cancel_admin_booking and updates local state after success', async () => {
    // Arrange
    const { service, supabase } = createServiceWithSupabaseDouble();

    // Act
    const cancelled = await service.cancelByAdmin(BOOKING_ID, {
      performedBy: ADMIN_ID,
      reason: 'Trash action cancellation'
    }).toPromise();

    // Assert
    expect(cancelled?.estado).toBe('cancelado');
    expect(service.items().find((turno) => turno.id === BOOKING_ID)?.estado).toBe('cancelado');
    expect(supabase.rpcCalls).toContainEqual({
      fn: 'cancel_admin_booking',
      args: {
        booking_id: BOOKING_ID,
        branch_id: BRANCH_ID,
        performed_by: ADMIN_ID,
        notes: 'Trash action cancellation',
        reason: undefined
      }
    });
  });

  it('does not emit app-side cancellation email events when Supabase trigger owns lifecycle emails', async () => {
    // Arrange
    const { service } = createServiceWithSupabaseDouble();
    const notifications = new MockNotificationService();
    service.attachNotificationService(notifications);

    // Act
    await service.cancelByAdmin(BOOKING_ID, {
      performedBy: ADMIN_ID,
      reason: 'Supabase-triggered cancellation email'
    }).toPromise();

    // Assert
    expect(notifications.getRecentLog()).toHaveLength(0);
  });

  it('does not falsely update local state when the cancel RPC denies the branch scope', async () => {
    // Arrange
    const { service, supabase } = createServiceWithSupabaseDouble();
    supabase.rpc = (fn: string, args: Record<string, unknown>) => {
      supabase.rpcCalls.push({ fn, args });
      if (fn === 'assert_admin_booking_in_branch') {
        return Promise.resolve({ data: { booking_id: BOOKING_ID }, error: null });
      }
      if (fn === 'cancel_admin_booking') {
        return Promise.resolve({ data: null, error: { message: 'UNAUTHORIZED' } });
      }
      return Promise.resolve({ data: null, error: { message: `Unexpected RPC ${fn}` } });
    };

    // Act / Assert
    await expect(service.cancelByAdmin(BOOKING_ID, {
      performedBy: ADMIN_ID,
      reason: 'Denied by branch scope'
    }).toPromise()).rejects.toThrow('UNAUTHORIZED');

    expect(service.items().find((turno) => turno.id === BOOKING_ID)?.estado).toBe('confirmado');
  });

  it('records sanitized durable telemetry for admin cancel failures without throwing', async () => {
    // Arrange
    const { service, supabase } = createServiceWithSupabaseDouble();

    // Act
    await service.recordAdminCancelFailureTelemetry({
      stage: 'rpc',
      code: 'UNAUTHORIZED raw provider detail <script>alert(1)</script>',
      status: 700,
      retryable: true
    });

    // Assert
    expect(supabase.rpcCalls).toContainEqual({
      fn: 'record_admin_booking_cancel_failure',
      args: {
        p_stage: 'rpc',
        p_code: 'UNAUTHORIZED_RAW_PROVIDER_DETAIL__SCRIPT_ALERT_1___SCRIPT_',
        p_status: undefined,
        p_retryable: true
      }
    });
    expect(JSON.stringify(supabase.rpcCalls.at(-1)?.args)).not.toMatch(/provider detail <script>|message|stack|booking_id/i);
  });

  it('renders sanitized admin cancel failure feedback and does not falsely update local state', async () => {
    // Arrange
    const turnos: TurnoWithRelations[] = [{
      id: BOOKING_ID,
      branchId: BRANCH_ID,
      clienteId: 'cust-admin-cancel-001',
      servicioId: 'svc-admin-cancel-001',
      fecha: new Date('2035-01-15T00:00:00.000Z'),
      hora: '09:30',
      duracionMinutos: 30,
      estado: 'confirmado',
      notas: 'Original notes',
      precio: 0,
      clienteNombre: 'Cliente Test',
      servicioNombre: 'Servicio Test',
      createdAt: new Date('2035-01-01T00:00:00.000Z'),
      updatedAt: new Date('2035-01-01T00:00:00.000Z')
    }];
    const cancelByAdmin = vi.fn(() => Promise.reject(new Error('UNAUTHORIZED: raw backend branch policy detail')));
    const recordAdminCancelFailureTelemetry = vi.fn(() => Promise.resolve());
    const branchContext = getBranchContextService() as { getActiveBranchId?: () => string | null };
    branchContext.getActiveBranchId = () => BRANCH_ID;
    const injector = Injector.create({
      providers: [
        { provide: BookingCrudService, useValue: { cancelByAdmin } },
        { provide: BookingNotificationsService, useValue: { recordAdminCancelFailureTelemetry } },
        { provide: BookingSchedulingService, useValue: {} },
        { provide: BookingAvailabilityService, useValue: {} },
        { provide: ClienteService, useValue: { getAll: vi.fn(), items: signal([]) } },
        { provide: ServicioService, useValue: { getAll: vi.fn(), items: signal([]) } },
        { provide: ThemeService, useValue: { activeTheme: signal('zen') } },
        {
          provide: BusinessService,
          useValue: {
            settings: signal(null),
            getDefaultWorkingHours: () => ({
              sunday: null,
              monday: null,
              tuesday: null,
              wednesday: null,
              thursday: null,
              friday: null,
              saturday: null
            })
          }
        },
        { provide: AuthService, useValue: { user: () => ({ id: ADMIN_ID }) } },
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    });
    const component = runInInjectionContext(injector, () => new TurnosListPage()) as any;
    component.turnos.set(turnos);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const template = readFileSync(
      join(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.html'),
      'utf-8'
    );

    // Act
    await component.cancelTurno(turnos[0]);
    const host = document.createElement('div');
    host.innerHTML = `<p role="alert" data-testid="turnos-admin-cancel-feedback">${component.adminCancelFeedback()}</p>`;
    const alert = host.querySelector('[role="alert"][data-testid="turnos-admin-cancel-feedback"]') as HTMLElement | null;

    // Assert
    expect(template).toMatch(/role="alert"[\s\S]{0,120}data-testid="turnos-admin-cancel-feedback"|data-testid="turnos-admin-cancel-feedback"[\s\S]{0,120}role="alert"/i);
    expect(alert?.textContent?.trim()).toBe('No pudimos cancelar el turno. Revisá el alcance activo e intentá nuevamente.');
    expect(alert?.textContent).not.toMatch(/UNAUTHORIZED|raw backend|ACTIVE_BRANCH_REQUIRED|TURNO_NOT_FOUND/i);
    expect(component.turnos()[0]?.estado).toBe('confirmado');
    expect(recordAdminCancelFailureTelemetry).toHaveBeenCalledWith({
      stage: 'rpc',
      code: 'PERMISSION_OR_STATE_GUARD',
      retryable: true
    });
  });
});
