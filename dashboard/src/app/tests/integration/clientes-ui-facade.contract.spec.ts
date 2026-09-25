import { beforeEach, describe, expect, it, vi } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { ClienteService } from '../../services/cliente.service';

type ClienteListItem = {
  id: string;
  fullName: string;
  telefono: string;
  email: string | null;
};

type ClientesUiFacade = {
  load(): Promise<void>;
  getList(): ClienteListItem[];
  search(query: string): ClienteListItem[];
  create(input: {
    nombre: string;
    apellido: string;
    telefono: string;
    email?: string;
    notas?: string;
  }): Promise<{ id: string }>;
  edit(id: string, input: {
    nombre?: string;
    apellido?: string;
    telefono?: string;
    email?: string;
    notas?: string;
  }): Promise<void>;
};

async function loadClientesUiFacadeModule(): Promise<{ ClientesUiFacade: new (...args: unknown[]) => ClientesUiFacade } | null> {
  try {
    const module = await import('../../services/clientes-ui.facade');
    return module as { ClientesUiFacade: new (...args: unknown[]) => ClientesUiFacade };
  } catch {
    return null;
  }
}

describe('Sprint 1 - Clients list/search/create/edit contract (mock mode)', () => {
  let clienteService: ClienteService;

  beforeEach(async () => {
    clienteService = new ClienteService();
    await firstValueFrom(clienteService.getAll());
  });

  it('search is case-insensitive and trims user input spaces', async () => {
    const resultados = await firstValueFrom(clienteService.search('   maría   '));

    expect(resultados.length).toBeGreaterThan(0);
    expect(resultados.some(c => c.nombre.toLowerCase() === 'maría')).toBe(true);
  });

  it('supports deterministic create + edit flow for client profile updates', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T10:00:00.000Z'));

    const creado = await firstValueFrom(clienteService.create({
      nombre: 'Lucía',
      apellido: 'Test',
      telefono: '+5493410000000'
    }));

    vi.setSystemTime(new Date('2026-01-01T10:05:00.000Z'));

    const actualizado = await firstValueFrom(
      clienteService.update(creado.id, {
        telefono: '+5493419999999',
        notas: 'Prefiere turno de tarde'
      })
    );

    expect(creado.id.startsWith('cliente-')).toBe(true);
    expect(actualizado.telefono).toBe('+5493419999999');
    expect(actualizado.notas).toBe('Prefiere turno de tarde');
    expect(actualizado.updatedAt.getTime()).toBeGreaterThan(creado.createdAt.getTime());

    vi.useRealTimers();
  });

  it('defines UI facade contract for upcoming Clientes page implementation', async () => {
    // TODO(Aurora): implementar facade en src/app/facades/clientes-ui.facade.ts
    const facadeModule = await loadClientesUiFacadeModule();
    expect(facadeModule, 'Missing clientes-ui facade contract module').not.toBeNull();

    const facade = new facadeModule!.ClientesUiFacade(clienteService);
    await facade.load();

    const list = facade.getList();
    expect(list.length).toBeGreaterThan(0);
    expect(list[0]).toMatchObject({
      id: expect.any(String),
      fullName: expect.any(String),
      telefono: expect.any(String)
    });

    const buscados = facade.search('maria');
    expect(buscados.length).toBeGreaterThan(0);
  });
});
