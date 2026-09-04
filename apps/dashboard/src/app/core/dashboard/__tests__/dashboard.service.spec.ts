// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

const homePageSource = readFileSync(
  resolve(process.cwd(), 'src/app/features/dashboard-home/pages/dashboard-home.page.ts'),
  'utf8'
);

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

class QueuedBookingQueries implements BookingQueries {
  constructor(private readonly queue: BookingRecord[][]) {}
  listBookingsByBranch = vi.fn(async () => this.queue.shift() ?? []);
  getAvailabilityWindows = vi.fn(async () => []);
  getBookingCounts = vi.fn(async () => ({ total: 0, hoy: 0, futuros: 0 }));
}

function setAfternoonNow(service: DashboardService): void {
  const afternoon = new Date();
  afternoon.setHours(15, 0, 0, 0);
  service.now.set(afternoon);
}

const branchContextMock = vi.hoisted(() => {
  const mock = {
    activeBranchId: 'br-1' as string | null,
    ensureLoaded: vi.fn(async () => undefined)
  };
  return mock;
});

vi.mock('../../branches/branch-context.service', () => ({
  getBranchContextService: () => ({
    getActiveBranchId: () => branchContextMock.activeBranchId,
    ensureLoaded: () => branchContextMock.ensureLoaded()
  }),
  registerSectionCacheInvalidator: () => undefined,
  invalidateSectionCaches: () => undefined
}));

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
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
    branchContextMock.activeBranchId = 'br-1';
    branchContextMock.ensureLoaded.mockReset();
    branchContextMock.ensureLoaded.mockImplementation(async () => undefined);
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

  it('labels unpaid seña bookings as Pendiente de seña instead of confirmado', async () => {
    const queries = new InMemoryBookingQueries([todayRecord({ depositStatus: 'pending' })]);
    const service = createService(queries);
    await flush();
    expect(service.featuredAppointments()[0]).toMatchObject({
      estado: 'confirmado',
      badgeLabel: 'Pendiente de seña',
      depositPending: true
    });
  });

    it('computes completed-today ticket average from BookingQueries rows', async () => {
    const queries = new InMemoryBookingQueries([todayRecord({ estado: 'completado' })]);
    const service = createService(queries);
    await flush();
    expect(service.stats()).toEqual({ ticketPromedio: 1000, nuevosClientes: 0 });
    expect(service.featuredAppointments()[0]?.estado).toBe('completado');
  });

  it('counts a today booking whose end time is already past as totalAppointments', async () => {
    const queries = new InMemoryBookingQueries([todayRecord({ hora: '00:00', duracionMinutos: 1 })]);
    const service = createService(queries);
    await flush();
    setAfternoonNow(service);
    expect(service.agendaStatus().totalAppointments).toBe(1);
  });

  it('drops an already-ended today booking from featuredAppointments', async () => {
    const queries = new InMemoryBookingQueries([todayRecord({ hora: '00:00', duracionMinutos: 1 })]);
    const service = createService(queries);
    await flush();
    setAfternoonNow(service);
    expect(service.featuredAppointments()).toHaveLength(0);
  });

  it('does not count a cancelled today booking', async () => {
    const queries = new InMemoryBookingQueries([
      todayRecord({ hora: '23:59', estado: 'cancelado' })
    ]);
    const service = createService(queries);
    await flush();
    expect(service.agendaStatus().totalAppointments).toBe(0);
    expect(service.featuredAppointments()).toHaveLength(0);
  });

  it('skips network and does not set isLoading when home bookings are already warm', async () => {
    const queries = new InMemoryBookingQueries([todayRecord()]);
    const service = createService(queries);
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);
    expect(service.isLoading()).toBe(false);

    service.refreshData();
    expect(service.isLoading()).toBe(false);
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);
  });

  it('treats a successful empty home booking list as warm', async () => {
    const queries = new InMemoryBookingQueries([]);
    const service = createService(queries);
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);

    service.refreshData();
    expect(service.isLoading()).toBe(false);
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);
  });

  it('refetches home bookings after invalidate()', async () => {
    const queries = new QueuedBookingQueries([
      [],
      [todayRecord({ hora: '23:59', duracionMinutos: 1 })]
    ]);
    const service = createService(queries);
    await flush();
    setAfternoonNow(service);
    expect(service.agendaStatus().totalAppointments).toBe(0);
    expect(service.featuredAppointments()).toHaveLength(0);

    service.invalidate();
    service.refreshData();
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(2);
    expect(service.agendaStatus().totalAppointments).toBe(1);
    expect(service.featuredAppointments()[0]?.dateLabel).toBe('Hoy');
  });

  it('refreshes bookings when booking.created is dispatched', async () => {
    const queries = new QueuedBookingQueries([
      [],
      [todayRecord({ hora: '00:00', duracionMinutos: 1 })]
    ]);
    const service = createService(queries);
    await flush();
    setAfternoonNow(service);
    expect(service.agendaStatus().totalAppointments).toBe(0);

    window.dispatchEvent(new CustomEvent('booking.created'));
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(2);
    expect(service.agendaStatus().totalAppointments).toBe(1);
  });

  it('refreshes bookings when operator.agenda.sync is dispatched', async () => {
    const queries = new QueuedBookingQueries([
      [],
      [todayRecord({ hora: '00:00', duracionMinutos: 1 })]
    ]);
    const service = createService(queries);
    await flush();
    setAfternoonNow(service);
    expect(service.agendaStatus().totalAppointments).toBe(0);

    window.dispatchEvent(new CustomEvent('operator.agenda.sync'));
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(2);
    expect(service.agendaStatus().totalAppointments).toBe(1);
  });

  it('refetches when visibilitychange is visible after a warm empty list', async () => {
    const queries = new InMemoryBookingQueries([]);
    createService(queries);
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible'
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(2);
  });

  it('does not refetch when visibilitychange is hidden', async () => {
    const queries = new InMemoryBookingQueries([]);
    createService(queries);
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);
  });

  it('DashboardHomeComponent keeps constructor-driven freshness; ngOnInit must not require a refetch on every enter', () => {
    expect(homePageSource).toMatch(/class DashboardHomeComponent/);
    expect(homePageSource).not.toMatch(
      /ngOnInit\s*\([^)]*\)\s*\{[\s\S]*?dashboardService\.refreshData\s*\(/
    );
  });

  it('waits for ensureLoaded before listing and does not settle empty while branch is still loading', async () => {
    branchContextMock.activeBranchId = null;
    let releaseEnsure!: () => void;
    const ensureGate = new Promise<void>((resolve) => {
      releaseEnsure = resolve;
    });
    branchContextMock.ensureLoaded.mockImplementation(async () => {
      await ensureGate;
      branchContextMock.activeBranchId = 'br-1';
    });

    const queries = new InMemoryBookingQueries([todayRecord()]);
    const service = createService(queries);
    await flush();

    expect(queries.listBookingsByBranch).not.toHaveBeenCalled();
    expect(service.featuredAppointments()).toHaveLength(0);

    releaseEnsure();
    await ensureGate;
    await flush();

    expect(queries.listBookingsByBranch).toHaveBeenCalledWith(
      'br-1',
      expect.objectContaining({ from: expect.any(Date), to: expect.any(Date) })
    );
    expect(service.featuredAppointments()).toHaveLength(1);
    expect(service.agendaStatus().totalAppointments).toBe(1);
  });

  it('holds admin turnos list rows as warm for the same branch and clears them on invalidate', () => {
    const queries = new InMemoryBookingQueries([]);
    const service = createService(queries);
    const rows = [todayRecord()];
    service.rememberAdminBookings('br-1', rows);
    expect(service.isAdminBookingsWarm('br-1')).toBe(true);
    expect(service.isAdminBookingsWarm('br-2')).toBe(false);
    expect(service.getAdminBookings()).toEqual(rows);
    service.invalidate();
    expect(service.isAdminBookingsWarm('br-1')).toBe(false);
  });

  it('does not list bookings when ensureLoaded still has no active branch', async () => {
    branchContextMock.activeBranchId = null;
    branchContextMock.ensureLoaded.mockImplementation(async () => undefined);

    const queries = new InMemoryBookingQueries([todayRecord()]);
    const service = createService(queries);
    await flush();

    expect(queries.listBookingsByBranch).not.toHaveBeenCalled();
    expect(service.featuredAppointments()).toHaveLength(0);
    expect(service.agendaStatus().totalAppointments).toBe(0);
  });

  it('overlapping refreshData does not let an empty-branch path overwrite loaded rows', async () => {
    branchContextMock.activeBranchId = null;
    let releaseEnsure!: () => void;
    const ensureGate = new Promise<void>((resolve) => {
      releaseEnsure = resolve;
    });
    let inFlight: Promise<void> | null = null;
    branchContextMock.ensureLoaded.mockImplementation(async () => {
      if (inFlight) return inFlight;
      inFlight = (async () => {
        await ensureGate;
        branchContextMock.activeBranchId = 'br-1';
      })();
      return inFlight;
    });

    let listCalls = 0;
    let releaseFirstList!: () => void;
    const firstListGate = new Promise<void>((resolve) => {
      releaseFirstList = resolve;
    });
    const rows = [todayRecord()];
    const queries = new InMemoryBookingQueries(rows);
    queries.listBookingsByBranch = vi.fn(async () => {
      listCalls += 1;
      if (listCalls === 1) {
        await firstListGate;
        return rows;
      }
      return rows;
    });

    const service = createService(queries);
    service.refreshData();
    await flush();
    expect(queries.listBookingsByBranch).not.toHaveBeenCalled();

    releaseEnsure();
    await ensureGate;
    await flush();
    expect(queries.listBookingsByBranch).toHaveBeenCalled();

    releaseFirstList();
    await firstListGate;
    await flush();

    expect(service.featuredAppointments()).toHaveLength(1);
    expect(service.agendaStatus().totalAppointments).toBe(1);
  });
});
