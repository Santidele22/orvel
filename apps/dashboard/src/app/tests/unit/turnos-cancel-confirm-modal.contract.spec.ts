// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DestroyRef, Injector, PLATFORM_ID, runInInjectionContext, signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingNotificationsService,
  BookingSchedulingService
} from '@orvel/booking/application';
import { getBranchContextService } from '../../core/branches/branch-context.service';
import type { TurnoWithRelations } from '../../features/booking/models/turno.model';
import { TurnosListPage } from '../../features/booking/pages/turnos-list.page';
import { AuthService } from '../../services/auth.service';
import { ACTIVE_BRANCH_STORAGE_KEY } from '../../core/storage/browser-storage-keys';
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { ThemeService } from '../../core/theming/theme.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { Router } from '@angular/router';

const BRANCH_ID = 'branch-cancel-modal-001';
const ADMIN_ID = 'admin-cancel-modal-001';
const BOOKING_ID = 'booking-cancel-modal-001';

const PAGE_TS = 'src/app/features/booking/pages/turnos-list.page.ts';
const PAGE_HTML = 'src/app/features/booking/pages/turnos-list.page.html';

function read(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

function methodBody(sourceText: string, methodName: string): string {
  const signatureMatch = new RegExp(
    `\\n\\s{2}(?:private\\s+|protected\\s+|public\\s+)?(?:async\\s+)?${methodName}\\s*\\(`
  ).exec(sourceText);
  if (!signatureMatch?.index) return '';

  const signatureStart = signatureMatch.index + 1;
  const bodyStart = sourceText.indexOf('{', signatureStart);
  if (bodyStart === -1) return '';

  let depth = 0;
  for (let index = bodyStart; index < sourceText.length; index += 1) {
    const char = sourceText[index];
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth === 0) return sourceText.slice(signatureStart, index + 1);
  }

  return sourceText.slice(signatureStart);
}

function sampleTurno(): TurnoWithRelations {
  return {
    id: BOOKING_ID,
    branchId: BRANCH_ID,
    clienteId: 'cust-cancel-modal-001',
    servicioId: 'svc-cancel-modal-001',
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
  };
}

function createPage(cancelByAdmin: ReturnType<typeof vi.fn>, extras?: {
  recordAdminCancelFailureTelemetry?: ReturnType<typeof vi.fn>;
}) {
  const recordAdminCancelFailureTelemetry = extras?.recordAdminCancelFailureTelemetry ?? vi.fn(() => Promise.resolve());
  const branchContext = getBranchContextService() as { getActiveBranchId?: () => string | null };
  branchContext.getActiveBranchId = () => BRANCH_ID;
  const injector = Injector.create({
    providers: [
      { provide: BookingCrudService, useValue: { cancelByAdmin, getAll: vi.fn(() => Promise.resolve([])) } },
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
      { provide: AuthService, useValue: { user: () => ({ id: ADMIN_ID, activeBranchId: BRANCH_ID }) } },
      { provide: Router, useValue: { navigate: vi.fn() } },
      { provide: PLATFORM_ID, useValue: 'server' },
      { provide: DestroyRef, useValue: { onDestroy: () => undefined } }
    ]
  });
  const component = runInInjectionContext(injector, () => new TurnosListPage()) as TurnosListPage & {
    turnos: { set: (value: TurnoWithRelations[]) => void };
    pendingCancelTurno: () => TurnoWithRelations | null;
    adminCancelFeedback: () => string | null;
    cancelTurno: (turno: TurnoWithRelations) => void | Promise<void>;
    confirmCancelTurno: () => Promise<void>;
    dismissCancelTurnoConfirm: () => void;
  };
  component.turnos.set([sampleTurno()]);
  return { component, recordAdminCancelFailureTelemetry };
}

describe('Turnos cancel confirm modal contract', () => {
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

  it('renders a dashboard confirm dialog with stable testids', () => {
    const html = read(PAGE_HTML);

    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-modal["']/);
    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-overlay["']/);
    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-cancel["']/);
    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-confirm["']/);
    expect(html).toMatch(/role=["']dialog["'][\s\S]{0,400}data-testid=["']turnos-cancel-confirm-modal["']|data-testid=["']turnos-cancel-confirm-modal["'][\s\S]{0,400}role=["']dialog["']/);
    expect(html).toMatch(/¿Cancelar este turno\?/);
    expect(html).toMatch(/pendingCancelTurno\(\)\?\.clienteNombre|pendingCancelTurno\(\)[^;]{0,80}clienteNombre/);
    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-overlay["'][\s\S]{0,360}\(click\)=["']dismissCancelTurnoConfirm\(\)["']/);
    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-cancel["'][\s\S]{0,360}\(click\)=["']dismissCancelTurnoConfirm\(\)["']/);
    expect(html).toMatch(/data-testid=["']turnos-cancel-confirm-confirm["'][\s\S]{0,420}\(click\)=["']confirmCancelTurno\(\)["']/);
  });

  it('opens the confirm modal from the X action without native confirm', () => {
    const html = read(PAGE_HTML);
    const ts = read(PAGE_TS);
    const cancelByAdmin = vi.fn(() => Promise.resolve());
    const { component } = createPage(cancelByAdmin);
    const nativeConfirm = vi.spyOn(window, 'confirm');

    expect(html).toMatch(/data-testid=["']turno-admin-cancel-action["']/);
    expect(html).toMatch(/\(click\)=["']cancelTurno\(turno\)["']/);
    expect(methodBody(ts, 'cancelTurno')).not.toMatch(/\b(?:window\.)?confirm\s*\(/);

    void component.cancelTurno(sampleTurno());

    expect(nativeConfirm).not.toHaveBeenCalled();
    expect(cancelByAdmin).not.toHaveBeenCalled();
    expect(component.pendingCancelTurno()?.id).toBe(BOOKING_ID);
  });

  it('does not use native confirm in cancelTurno or deleteTurno', () => {
    const ts = read(PAGE_TS);
    const cancelBody = methodBody(ts, 'cancelTurno');
    const deleteBody = methodBody(ts, 'deleteTurno');

    expect(cancelBody.length).toBeGreaterThan(0);
    expect(deleteBody.length).toBeGreaterThan(0);
    expect(cancelBody).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
    expect(deleteBody).not.toMatch(/\b(?:window\.)?confirm\s*\(/);
  });

  it('dismisses via cancel or overlay without calling cancelByAdmin', async () => {
    const cancelByAdmin = vi.fn(() => Promise.resolve());
    const { component } = createPage(cancelByAdmin);

    void component.cancelTurno(sampleTurno());
    expect(component.pendingCancelTurno()?.id).toBe(BOOKING_ID);

    component.dismissCancelTurnoConfirm();

    expect(component.pendingCancelTurno()).toBeNull();
    expect(cancelByAdmin).not.toHaveBeenCalled();
  });

  it('confirm runs cancelByAdmin with performedBy and acceso rápido reason', async () => {
    const cancelByAdmin = vi.fn(() => Promise.resolve());
    const { component } = createPage(cancelByAdmin);

    void component.cancelTurno(sampleTurno());
    await component.confirmCancelTurno();

    expect(cancelByAdmin).toHaveBeenCalledWith(
      BOOKING_ID,
      expect.objectContaining({
        performedBy: ADMIN_ID,
        reason: 'Cancelado desde acceso rápido'
      })
    );
  });

  it('keeps sanitized admin cancel failure feedback after confirm', async () => {
    const cancelByAdmin = vi.fn(() => Promise.reject(new Error('UNAUTHORIZED: raw backend branch policy detail')));
    const { component, recordAdminCancelFailureTelemetry } = createPage(cancelByAdmin);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    void component.cancelTurno(sampleTurno());
    await component.confirmCancelTurno();

    const host = document.createElement('div');
    host.innerHTML = `<p role="alert" data-testid="turnos-admin-cancel-feedback">${component.adminCancelFeedback()}</p>`;
    const alert = host.querySelector('[role="alert"][data-testid="turnos-admin-cancel-feedback"]') as HTMLElement | null;

    expect(read(PAGE_HTML)).toMatch(
      /role="alert"[\s\S]{0,120}data-testid="turnos-admin-cancel-feedback"|data-testid="turnos-admin-cancel-feedback"[\s\S]{0,120}role="alert"/i
    );
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
