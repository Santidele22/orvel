import '@angular/compiler';
import { Injector, runInInjectionContext, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { ClienteService } from '../../features/clientes/data-access/cliente.service';
import { ClientesUiFacade } from '../../features/clientes/data-access/clientes-ui.facade';
import { ServicioService } from '../../features/servicios/data-access/servicio.service';
import { ServiciosPage } from '../../features/servicios/pages/servicios.page';
import { ThemeService } from '../../core/theming/theme.service';

const mocks = vi.hoisted(() => ({
  branchContext: {
    ensureLoaded: vi.fn(async () => undefined),
    getActiveBusinessId: vi.fn(async () => 'business-1')
  }
}));

vi.mock('../../core/branches/branch-context.service', () => ({
  getBranchContextService: () => mocks.branchContext,
  registerSectionCacheInvalidator: () => undefined,
  invalidateSectionCaches: () => undefined
}));

describe('Dashboard service actions behavior', () => {
  it('maps persisted inactive customer state into the clientes UI facade', async () => {
    const clienteService = {
      getAll: vi.fn(() => of([])),
      items: signal([
        {
          id: 'cliente-active',
          nombre: 'Ana',
          apellido: 'Activa',
          telefono: '+541111111111',
          email: 'ana@example.com',
          active: true,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01')
        },
        {
          id: 'cliente-inactive',
          nombre: 'Ina',
          apellido: 'Ctiva',
          telefono: '+542222222222',
          active: false,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01')
        }
      ])
    } as unknown as ClienteService;

    const facade = new ClientesUiFacade(clienteService);

    await facade.load();

    expect(facade.getList()).toEqual([
      expect.objectContaining({ id: 'cliente-active', active: true, purgeAt: null }),
      expect.objectContaining({ id: 'cliente-inactive', active: false, purgeAt: null })
    ]);
  });

  it('loads and deactivates customers through the real Supabase active column only', async () => {
    const selectedColumns: string[] = [];
    const updatePayloads: Array<Record<string, unknown>> = [];
    const service = runInInjectionContext(Injector.create({ providers: [] }), () => new ClienteService());

    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn((columns: string) => {
          selectedColumns.push(columns);
          return {
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: [
                  {
                    id: 'customer-1',
                    business_id: 'business-1',
                    full_name: 'Ina Ctiva',
                    email: null,
                    phone: '+542222222222',
                    created_at: '2026-01-01T00:00:00.000Z',
                    active: false
                  }
                ],
                error: null
              }))
            }))
          };
        }),
        update: vi.fn((payload: Record<string, unknown>) => {
          updatePayloads.push(payload);
          return {
            eq: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }))
          };
        })
      }))
    };

    const customers = await (
      service as unknown as {
        loadCustomersFromSupabase(client: unknown): Promise<Array<{ id: string; active?: boolean; activo?: boolean }>>;
        updateCustomerInSupabase(client: unknown, id: string, dto: { id: string; nombre: string; apellido: string; telefono: string; active: boolean; createdAt: Date; updatedAt: Date }): Promise<void>;
      }
    ).loadCustomersFromSupabase(supabase);
    await (
      service as unknown as {
        updateCustomerInSupabase(client: unknown, id: string, dto: { id: string; nombre: string; apellido: string; telefono: string; active: boolean; createdAt: Date; updatedAt: Date }): Promise<void>;
      }
    ).updateCustomerInSupabase(supabase, 'customer-1', {
      id: 'customer-1',
      nombre: 'Ina',
      apellido: 'Ctiva',
      telefono: '+542222222222',
      active: false,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-02')
    });

    expect(customers[0]).toEqual(expect.objectContaining({ id: 'customer-1', active: false, activo: false }));
    expect(selectedColumns.join('\n')).toContain('active');
    expect(selectedColumns.join('\n')).not.toMatch(/is_active|status|purge_at/);
    expect(updatePayloads).toEqual([
      expect.objectContaining({ full_name: 'Ina Ctiva', phone: '+542222222222', active: false })
    ]);
    expect(Object.keys(updatePayloads[0])).not.toEqual(expect.arrayContaining(['is_active', 'status', 'purge_at']));
  });

  it('hides inactive services from the visible catalog and only deletes after confirmation', async () => {
    const servicios = signal([
      {
        id: 'svc-active',
        nombre: 'Corte',
        categoria: 'Peluquería',
        duracionMinutos: 30,
        precio: 1000,
        activo: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01')
      },
      {
        id: 'svc-inactive',
        nombre: 'Color',
        categoria: 'Peluquería',
        duracionMinutos: 60,
        precio: 2000,
        activo: false,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01')
      }
    ]);
    const update = vi.fn((id: string) => {
      servicios.update((current) => current.map((service) => service.id === id ? { ...service, activo: false } : service));
      return of(servicios().find((service) => service.id === id));
    });

    const injector = Injector.create({
      providers: [
        FormBuilder,
        {
          provide: ServicioService,
          useValue: {
          getAll: vi.fn(() => of(servicios())),
          items: servicios,
          isLoaded: () => false,
          listCategorias: vi.fn(() => []),
          update,
          create: vi.fn(),
          createCategoria: vi.fn()
          }
        },
        { provide: ThemeService, useValue: { activeTheme: signal('zen') } },
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: { get: vi.fn(() => null) } } } },
        { provide: Router, useValue: { navigate: vi.fn() } }
      ]
    });

    const page = runInInjectionContext(injector, () => new ServiciosPage());
    page.servicios.set(servicios());

    expect(page.filteredServicios().map((service) => service.id)).toEqual(['svc-active']);

    page.openDeleteServicio('svc-active');
    page.cancelDeleteServicio();
    expect(update).not.toHaveBeenCalled();
    expect(page.filteredServicios().map((service) => service.id)).toEqual(['svc-active']);

    page.openDeleteServicio('svc-active');
    await page.confirmDeleteServicio();

    expect(update).toHaveBeenCalledWith('svc-active', { activo: false });
    expect(page.filteredServicios()).toEqual([]);
  });
});
