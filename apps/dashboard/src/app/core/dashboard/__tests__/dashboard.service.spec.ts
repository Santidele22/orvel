// @vitest-environment jsdom

import '@angular/compiler';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { of } from 'rxjs';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { BookingQueries, BookingRecord } from '@orvel/booking/application';
import { BOOKING_QUERIES } from '@orvel/booking/infrastructure';
import { ClienteService } from '../../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../../features/servicios/data-access/servicio.service';
import { BusinessService } from '../../../features/settings/data-access/business.service';
import { DashboardService } from '../dashboard.service';

const openDay = { start: '00:00', end: '23:59', enabled: true };
const workingHours = {
  sunday: openDay, monday: openDay, tuesday: openDay, wednesday: openDay,
  thursday: openDay, friday: openDay, saturday: openDay
};

function todayRecord(overrides: Partial<BookingRecord> = {}): BookingRecord {
  const now = new Date();
  return {
    id: 'b-1',
    branchId: 'br-1',
    clienteId: 'c-1',
    servicioId: 's-1',
    fecha: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    hora: '23:59',
    duracionMinutos: 30,
    estado: 'confirmado',
    precio: 1000,
    createdAt: now,
    updatedAt: now,
    ...overrides
  };
}

class InMemoryBookingQueries implements BookingQueries {
  constructor(
    private readonly rows: BookingRecord[],
    readonly listBookingsByBranch = vi.fn(async () => this.rows)
  ) {}
  getAvailabilityWindows = vi.fn(async () => []);
  getBookingCounts = vi.fn(async () => ({ total: this.rows.length, hoy: this.rows.length, futuros: 0 }));
}

vi.mock('../../branches/branch-context.service', () => ({
  getBranchContextService: () => ({ getActiveBranchId: () => 'br-1' })
}));

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createService(queries: BookingQueries, clients = [{ id: 'c-1', nombre: 'Ada' }], services = [{ id: 's-1', nombre: 'Corte' }]) {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      DashboardService,
      { provide: BOOKING_QUERIES, useValue: queries },
      { provide: ClienteService, useValue: { items: signal(clients), getAll: () => of(clients) } },
      { provide: ServicioService, useValue: { items: signal(services), getAll: () => of(services) } },
      { provide: BusinessService, useValue: { settings: signal({ workingHours, slotIntervalMinutes: 30 }) } }
    ]
  });
  return TestBed.inject(DashboardService);
}

describe('DashboardService BookingQueries consumer', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('loads branch bookings through BookingQueries and keeps featured shape', async () => {
    const queries = new InMemoryBookingQueries([todayRecord()]);
    const service = createService(queries);
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledWith(
      'br-1',
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) })
    );
    const featured = service.featuredAppointments();
    expect(featured).toHaveLength(1);
    expect(featured[0]).toMatchObject({ clienteNombre: 'Ada', servicioNombre: 'Corte', dateLabel: 'Hoy' });
    expect(service.agendaStatus().totalAppointments).toBe(1);
  });

  it('computes completed-today ticket average from BookingQueries rows', async () => {
    const queries = new InMemoryBookingQueries([todayRecord({ estado: 'completado' })]);
    const service = createService(queries);
    await flush();
    expect(service.stats()).toEqual({ ticketPromedio: 1000, nuevosClientes: 0 });
    expect(service.featuredAppointments()[0]?.estado).toBe('completado');
  });
});
