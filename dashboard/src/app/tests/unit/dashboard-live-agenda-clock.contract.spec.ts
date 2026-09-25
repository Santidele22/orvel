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
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { BusinessService } from '../../features/settings/data-access/business.service';
import { DashboardService } from '../../core/dashboard/dashboard.service';
import { pickNextAppointment } from '../../features/dashboard-home/pages/pick-next-appointment';
import { filterLiveAvailableStarts, filterLiveTurnos, readArgentinaClock } from '../../core/time/argentina-clock';

const ART_1500 = new Date('2026-08-28T18:00:00.000Z');
const ART_1501 = new Date('2026-08-28T18:01:00.000Z');
const ART_1631 = new Date('2026-08-28T19:31:00.000Z');
const CIVIL_TODAY = new Date(2026, 7, 28);
const TODAY_KEY = '2026-08-28';
const TODAY_HOURS = ['09:00', '10:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
const openDay = { start: '00:00', end: '23:59', enabled: true };
const workingHours = {
  sunday: openDay, monday: openDay, tuesday: openDay, wednesday: openDay,
  thursday: openDay, friday: openDay, saturday: openDay,
};

function booking(overrides: Partial<BookingRecord> = {}): BookingRecord {
  return {
    id: 'b-1', branchId: 'br-1', clienteId: 'c-1', servicioId: 's-1',
    fecha: CIVIL_TODAY, hora: '16:00', duracionMinutos: 30, estado: 'confirmado',
    precio: 1000, createdAt: ART_1500, updatedAt: ART_1500, ...overrides,
  };
}

class InMemoryBookingQueries implements BookingQueries {
  constructor(private readonly rows: BookingRecord[], readonly listBookingsByBranch = vi.fn(async () => this.rows)) {}
  getAvailabilityWindows = vi.fn(async () => []);
  getBookingCounts = vi.fn(async () => ({ total: this.rows.length, hoy: this.rows.length, futuros: 0 }));
}

vi.mock('../../core/branches/branch-context.service', () => ({
  getBranchContextService: () => ({ getActiveBranchId: () => 'br-1', ensureLoaded: async () => undefined }),
  registerSectionCacheInvalidator: () => undefined,
  invalidateSectionCaches: () => undefined,
}));

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

function createService(rows: BookingRecord[]) {
  const queries = new InMemoryBookingQueries(rows);
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      DashboardService,
      { provide: BOOKING_QUERIES, useValue: queries },
      { provide: ClienteService, useValue: { items: signal([{ id: 'c-1', nombre: 'Ada' }]), getAll: () => of([]) } },
      { provide: ServicioService, useValue: { items: signal([{ id: 's-1', nombre: 'Corte' }]), getAll: () => of([]) } },
      { provide: BusinessService, useValue: { settings: signal({ workingHours, slotIntervalMinutes: 30 }) } },
    ],
  });
  return { service: TestBed.inject(DashboardService), queries };
}

describe('Dashboard live agenda clock (#541)', () => {
  beforeAll(() => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
  });

  afterEach(() => {
    TestBed.resetTestingModule();
  });
  it('reads 15:00 America/Argentina/Buenos_Aires from a UTC instant, not browser hours', () => {
    expect(readArgentinaClock(ART_1500)).toEqual({ dateKey: TODAY_KEY, minutes: 15 * 60 });
  });

  it('hides today available starts before 15:00 Argentina', () => {
    const live = filterLiveAvailableStarts(TODAY_HOURS, TODAY_KEY, readArgentinaClock(ART_1500));
    expect(live.some((hour) => hour < '15:00')).toBe(false);
    expect(live).toEqual(['15:00', '15:30', '16:00']);
  });

  it('drops an ended 14:00 today turno from Turnos live list, featured, and próximo', async () => {
    const ended = booking({ id: 'ended', hora: '14:00', duracionMinutos: 60 });
    const later = booking({ id: 'later', hora: '16:00', duracionMinutos: 30 });
    expect(filterLiveTurnos([ended, later], readArgentinaClock(ART_1500)).map((row) => row.id)).toEqual(['later']);
    const { service } = createService([ended, later]);
    await flush();
    service.now.set(ART_1500);
    expect(service.featuredAppointments().map((row) => row.id)).toEqual(['later']);
    expect(pickNextAppointment(service.featuredAppointments(), ART_1500)?.id).toBe('later');
  });

  it('keeps a 16:00 today turno and an in-progress turno', async () => {
    const inProgress = booking({ id: 'now', hora: '14:30', duracionMinutos: 45 });
    const later = booking({ id: 'later', hora: '16:00', duracionMinutos: 30 });
    expect(filterLiveTurnos([inProgress, later], readArgentinaClock(ART_1500)).map((row) => row.id)).toEqual(['now', 'later']);
    const { service } = createService([inProgress, later]);
    await flush();
    service.now.set(ART_1500);
    expect(service.featuredAppointments().map((row) => row.id)).toEqual(['now', 'later']);
    expect(pickNextAppointment(service.featuredAppointments(), ART_1500)?.id).toBe('now');
  });

  it('drops a slot after the clock ticks without refetching bookings', async () => {
    const { service, queries } = createService([booking({ id: 'later', hora: '16:00' })]);
    await flush();
    service.now.set(ART_1500);
    expect(service.featuredAppointments().map((row) => row.id)).toEqual(['later']);
    expect(filterLiveAvailableStarts(TODAY_HOURS, TODAY_KEY, readArgentinaClock(ART_1500))).toContain('15:00');
    service.now.set(ART_1501);
    expect(filterLiveAvailableStarts(TODAY_HOURS, TODAY_KEY, readArgentinaClock(service.now()))).not.toContain('15:00');
    service.now.set(ART_1631);
    expect(service.featuredAppointments()).toHaveLength(0);
    expect(pickNextAppointment(service.featuredAppointments(), ART_1631)).toBeNull();
    expect(queries.listBookingsByBranch).toHaveBeenCalledTimes(1);
  });
  it('Turnos and Nuevo turno live-filter through the shared Argentina clock and ticking now', () => {
    const turnosList = readFileSync(resolve(process.cwd(), 'src/app/features/booking/pages/turnos-list.page.ts'), 'utf8');
    const turnoForm = readFileSync(resolve(process.cwd(), 'src/app/features/booking/pages/turno-form.page.ts'), 'utf8');
    expect(turnosList).toMatch(/core\/time\/argentina-clock/);
    expect(turnosList).toMatch(/dashboardService\.now\s*\(/);
    expect(turnosList).toMatch(/filterLiveTurnos\s*\(/);
    expect(turnosList).toMatch(/filterLiveAvailableStarts\s*\(/);
    expect(turnoForm).toMatch(/core\/time\/argentina-clock/);
    expect(turnoForm).toMatch(/filterLiveAvailableStarts\s*\(/);
    expect(turnoForm).toMatch(/\.now\s*\(/);
  });
});
