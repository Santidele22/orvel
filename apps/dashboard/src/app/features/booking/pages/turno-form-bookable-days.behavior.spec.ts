// @vitest-environment jsdom

import '@angular/compiler';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { provideZonelessChangeDetection, signal, ɵresolveComponentResources as resolveComponentResources } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BrowserTestingModule, platformBrowserTesting } from '@angular/platform-browser/testing';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { of } from 'rxjs';
import { TurnoFormPage } from './turno-form.page';
import {
  BookingAvailabilityService,
  BookingCrudService,
  BookingSchedulingService
} from '@orvel/booking/application';
import { ClienteService } from '../../clientes/data-access/cliente.service';
import { ServicioService } from '../../servicios/data-access/servicio.service';
import { AuthService } from '../../../services/auth.service';
import { getBranchContextService } from '../../../core/branches/branch-context.service';
import { ArgentinaClockService } from '../../../core/time/argentina-clock.service';
import type { Cliente } from '../../../models/cliente.model';
import type { Servicio } from '../../../models/servicio.model';

const mockClients: Cliente[] = [
  {
    id: 'cliente-1',
    nombre: 'Ana',
    apellido: 'Pérez',
    telefono: '1122334455',
    email: 'ana@example.com',
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z')
  }
];

const mockServices: Servicio[] = [
  {
    id: 'servicio-1',
    nombre: 'Corte',
    categoria: 'Peluquería',
    duracionMinutos: 30,
    precio: 12000,
    activo: true,
    createdAt: new Date('2026-07-01T10:00:00.000Z'),
    updatedAt: new Date('2026-07-01T10:00:00.000Z')
  }
];

describe('TurnoFormPage bookable days', () => {
  let loadAvailabilityAdminSlotTimes: ReturnType<typeof vi.fn>;

  beforeAll(async () => {
    TestBed.initTestEnvironment(BrowserTestingModule, platformBrowserTesting());
    await resolveComponentResources(async (url: string) => readFileSync(
      join(process.cwd(), 'src/app/features/booking/pages', url.replace('./', '')),
      'utf-8'
    ));
  });

  beforeEach(() => {
    const branchContext = getBranchContextService() as any;
    branchContext.ensureLoaded = vi.fn().mockResolvedValue(undefined);
    branchContext.requiresExplicitSelection = vi.fn(() => false);
    branchContext.getActiveBranchId = vi.fn(() => 'branch-1');
    branchContext.getActiveBusinessId = vi.fn().mockResolvedValue('business-1');
    branchContext.branches = signal([]).asReadonly();
    branchContext.activeBranchId = signal('branch-1').asReadonly();
    branchContext.setActiveBranch = vi.fn(() => true);

    const clients = signal(mockClients);
    const services = signal(mockServices);
    const authenticatedUser = signal({ id: 'admin-1', email: 'admin@example.com' });
    loadAvailabilityAdminSlotTimes = vi.fn(async ({ dateIso }: { dateIso: string }) => {
      if (dateIso === '2026-06-29') return ['10:00', '10:30'];
      if (dateIso === '2026-07-01') return ['11:00'];
      return [];
    });

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [TurnoFormPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { paramMap: { get: vi.fn(() => 'new') } } }
        },
        {
          provide: ClienteService,
          useValue: {
            getAll: vi.fn(() => of(mockClients)),
            items: clients.asReadonly()
          }
        },
        {
          provide: ServicioService,
          useValue: {
            getAll: vi.fn(() => of(mockServices)),
            items: services.asReadonly()
          }
        },
        {
          provide: BookingCrudService,
          useValue: {
            getAll: vi.fn().mockResolvedValue([]),
            getById: vi.fn()
          }
        },
        {
          provide: BookingSchedulingService,
          useValue: {
            create: vi.fn().mockResolvedValue({ bookingId: 'b-1', status: 'booked' }),
            rescheduleByAdmin: vi.fn().mockResolvedValue({ bookingId: 'b-1', status: 'booked' })
          }
        },
        {
          provide: BookingAvailabilityService,
          useValue: {
            loadAvailabilityAdminSlotTimes
          }
        },
        {
          provide: AuthService,
          useValue: {
            user: authenticatedUser.asReadonly()
          }
        },
        {
          provide: ArgentinaClockService,
          useValue: {
            now: signal(new Date(2026, 5, 29, 10, 0, 0)).asReadonly()
          }
        }
      ]
    });
  });

  async function renderTurnoForm() {
    const fixture = TestBed.createComponent(TurnoFormPage);
    fixture.componentRef.setInput('presentation', 'modal');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    return fixture;
  }

  it('does not keep an unconstrained type=date control that can pick a zero-slot day', async () => {
    const fixture = await renderTurnoForm();
    const dateControl = fixture.nativeElement.querySelector('[data-testid="turno-admin-date"]') as HTMLElement | null;

    expect(dateControl).not.toBeNull();
    expect(dateControl?.tagName).toBe('SELECT');
    expect(dateControl?.getAttribute('type')).not.toBe('date');
  });

  it('offers date options only for days that returned remaining-capacity hours', async () => {
    const fixture = await renderTurnoForm();
    const page = fixture.componentInstance;

    page.servicioId.set('servicio-1');
    await page.onServicioChange();
    fixture.detectChanges();

    const dateSelect = fixture.nativeElement.querySelector('[data-testid="turno-admin-date"]') as HTMLSelectElement;
    const optionValues = Array.from(dateSelect.options)
      .map(option => option.value)
      .filter(value => value);

    expect(optionValues).toEqual(['2026-06-29', '2026-07-01']);
    expect(optionValues).not.toContain('2026-06-30');
  });

  it('keeps hour options only from disponibles()', async () => {
    const fixture = await renderTurnoForm();
    const page = fixture.componentInstance;

    page.servicioId.set('servicio-1');
    await page.onServicioChange();
    fixture.detectChanges();

    const hourOptions = Array.from(
      fixture.nativeElement.querySelectorAll('[data-testid="turno-admin-available-slot-option"]')
    ) as HTMLOptionElement[];

    expect(hourOptions.map(option => option.value)).toEqual(['10:00', '10:30']);
    expect(page.disponibles()).toEqual(['10:00', '10:30']);
  });
});
