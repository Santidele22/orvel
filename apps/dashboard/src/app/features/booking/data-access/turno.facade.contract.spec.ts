import { Injector, runInInjectionContext } from '@angular/core';
import { readFileSync } from 'node:fs';
import { firstValueFrom } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../services/auth.service';
import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingNotificationsService,
  BookingSchedulingService
} from '@orvel/booking/application';
import { TurnoService } from './turno.facade';

const record = {
  id: 'b-1', branchId: 'br-1', clienteId: 'c-1', servicioId: 's-1',
  fecha: new Date('2026-08-17T00:00:00.000Z'), hora: '10:00', duracionMinutos: 30,
  estado: 'confirmado' as const, precio: 0, createdAt: new Date(), updatedAt: new Date()
};

function createFacade(overrides: Record<string, unknown> = {}) {
  const crud = {
    getAll: vi.fn().mockResolvedValue([record]),
    getById: vi.fn((items: typeof record[], id: string) => items.find((item) => item.id === id)),
    cancelByAdmin: vi.fn().mockResolvedValue({ bookingId: 'b-1', status: 'cancelled' })
  };
  const scheduling = {
    create: vi.fn().mockResolvedValue({ bookingId: 'b-2', status: 'confirmed' })
  };
  const injector = Injector.create({
    providers: [
      { provide: AuthService, useValue: { user: () => ({ id: 'admin-1', activeBranchId: 'br-1' }) } },
      { provide: BookingCrudService, useValue: crud },
      { provide: BookingSchedulingService, useValue: scheduling },
      { provide: BookingAvailabilityService, useValue: {} },
      { provide: BookingNotificationsService, useValue: { attachNotificationService: vi.fn() } },
      ...Object.entries(overrides).map(([provide, useValue]) => ({ provide, useValue }))
    ]
  });
  return { service: runInInjectionContext(injector, () => new TurnoService()), crud, scheduling };
}

describe('TurnoService thin facade', () => {
  it('stays at or under 80 lines and preserves the TurnoService export', () => {
    const source = readFileSync(new URL('./turno.facade.ts', import.meta.url), 'utf8');
    expect(source.trimEnd().split('\n').length).toBeLessThanOrEqual(80);
    expect(source).toMatch(/export class TurnoService/);
  });

  it('adapts capability Promises into Observables and maps records to Turno', async () => {
    const { service, crud } = createFacade();
    const items = await firstValueFrom(service.getAll());
    expect(crud.getAll).toHaveBeenCalledWith('br-1');
    expect(items).toEqual([expect.objectContaining({ id: 'b-1', clienteId: 'c-1', hora: '10:00' })]);
    expect(service.items()[0].servicioId).toBe('s-1');
  });

  it('delegates create to scheduling and cancel to CRUD', async () => {
    const { service, scheduling, crud } = createFacade();
    const created = await firstValueFrom(service.create({
      clienteId: 'c-2', servicioId: 's-2', fecha: new Date('2099-01-01'), hora: '11:00',
      duracionMinutos: 30, estado: 'confirmado', precio: 0
    }));
    expect(scheduling.create).toHaveBeenCalled();
    expect(created.id).toBe('b-2');
    await firstValueFrom(service.cancelByAdmin('b-1', { performedBy: 'admin-1' }));
    expect(crud.cancelByAdmin).toHaveBeenCalled();
  });
});
