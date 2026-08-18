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
import { TurnoService } from '../data-access/turno.facade';
import { ClienteService } from '../../clientes/data-access/cliente.service';
import { ServicioService } from '../../servicios/data-access/servicio.service';
import { AuthService } from '../../../services/auth.service';
import { getBranchContextService } from '../../../core/branches/branch-context.service';
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

describe('TurnoFormPage walk-in behavior', () => {
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
    branchContext.branches = signal([]).asReadonly();
    branchContext.activeBranchId = signal(null).asReadonly();
    branchContext.setActiveBranch = vi.fn(() => true);

    const clients = signal(mockClients);
    const services = signal(mockServices);
    const authenticatedUser = signal({ id: 'admin-1', email: 'admin@example.com' });

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
          provide: TurnoService,
          useValue: {
            ensureDefaultBranchId: vi.fn().mockResolvedValue('branch-1'),
            loadAvailabilityAdminSlotTimes: vi.fn().mockResolvedValue(['10:00', '10:30']),
            invalidateAdminAvailability: vi.fn(),
            create: vi.fn(() => of({}))
          }
        },
        {
          provide: AuthService,
          useValue: {
            user: authenticatedUser.asReadonly()
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

  it('reveals the manual walk-in name field only after choosing “No tiene ficha”', async () => {
    const fixture = await renderTurnoForm();

    expect(fixture.nativeElement.querySelector('[data-testid="turno-admin-walk-in-name"]')).toBeNull();

    const startWalkIn = fixture.nativeElement.querySelector('[data-testid="turno-admin-start-walk-in"]') as HTMLButtonElement | null;
    expect(startWalkIn).not.toBeNull();

    startWalkIn?.click();
    fixture.detectChanges();

    const walkInName = fixture.nativeElement.querySelector('[data-testid="turno-admin-walk-in-name"]') as HTMLInputElement | null;
    expect(walkInName).not.toBeNull();
    expect(walkInName?.placeholder).toBe('Nombre de la persona');
  });

  it('hides and clears the walk-in path after selecting an existing client', async () => {
    const fixture = await renderTurnoForm();

    (fixture.nativeElement.querySelector('[data-testid="turno-admin-start-walk-in"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const walkInName = fixture.nativeElement.querySelector('[data-testid="turno-admin-walk-in-name"]') as HTMLInputElement;
    walkInName.value = 'Cliente sin ficha';
    walkInName.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();

    const clientSelect = fixture.nativeElement.querySelector('[data-testid="turno-admin-client-select"]') as HTMLSelectElement;
    clientSelect.value = 'cliente-1';
    clientSelect.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="turno-admin-walk-in-name"]')).toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="turno-admin-start-walk-in"]')).toBeNull();
  });

  it('keeps a recoverable client path after an invalid submit without client data', async () => {
    const fixture = await renderTurnoForm();

    const form = fixture.nativeElement.querySelector('[data-testid="turno-admin-new-modal-form"]') as HTMLFormElement;
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Elegí un cliente o cargá el nombre para una atención sin ficha.');

    const startWalkIn = fixture.nativeElement.querySelector('[data-testid="turno-admin-start-walk-in"]') as HTMLButtonElement | null;
    expect(startWalkIn).not.toBeNull();

    startWalkIn?.click();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[data-testid="turno-admin-walk-in-name"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[data-testid="turno-admin-client-select"]')).not.toBeNull();
  });
});
