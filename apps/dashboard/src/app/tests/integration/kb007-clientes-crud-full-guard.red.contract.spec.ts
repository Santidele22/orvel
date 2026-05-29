/**
 * KB-007: Clientes CRUD (Full) - TDD Guard Tests
 *
 * RED contract: these tests should fail until ClienteService implements
 * full Supabase-backed CRUD, domain validations, booking constraints,
 * and robust loading/error/empty-state handling.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ClienteService } from '../../services/cliente.service';
import type { CreateClienteDTO } from '../../models/cliente.model';

function readClienteServiceSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/services/cliente.service.ts');
  return existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
}

const validCreateDto = (overrides: Partial<CreateClienteDTO> = {}): CreateClienteDTO => ({
  nombre: 'Lucía',
  apellido: 'Paredes',
  telefono: '+543411234567',
  email: 'lucia.paredes@example.com',
  notas: 'KB-007 create test',
  serviciosFavoritos: [],
  ...overrides
});

describe('KB-007.1 - Create Cliente (Supabase + validation)', () => {
  let service: ClienteService;

  beforeEach(() => {
    service = new ClienteService();
    service.setProvider('supabase');
  });

  it('KB-007.1.1 @RED - wires a Supabase create mutation for customers', () => {
    const source = readClienteServiceSource();
    const hasSupabaseClient = /@supabase\/supabase-js|createClient\(/i.test(source);
    const hasCreateMutation = /from\(['\"]customers['\"]\)[\s\S]*insert\(/i.test(source)
      || /createCustomerInSupabase|createClienteInSupabase|insertCustomer/i.test(source);

    expect(hasSupabaseClient).toBe(true);
    expect(hasCreateMutation).toBe(true);
  });

  it('KB-007.1.2 @RED - rejects create when nombre is missing', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ nombre: '   ' })))
    ).rejects.toThrow(/nombre|required|inválido|invalid/i);
  });

  it('KB-007.1.3 @RED - rejects create when apellido is missing', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ apellido: '   ' })))
    ).rejects.toThrow(/apellido|required|inválido|invalid/i);
  });

  it('KB-007.1.4 @RED - rejects create when contact policy is violated (telefono or valid email)', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ telefono: '   ', email: undefined })))
    ).rejects.toThrow(/telefono|email|required|contact|contacto|inválido|invalid/i);
  });

  it('KB-007.1.5 @RED - rejects create when email format is invalid', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ email: 'not-an-email' })))
    ).rejects.toThrow(/email|correo|format|formato|inválido|invalid/i);
  });

  it('KB-007.1.6 @RED - rejects create when telefono format is invalid', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ telefono: 'abc' })))
    ).rejects.toThrow(/telefono|phone|format|formato|inválido|invalid/i);
  });

  it('KB-007.1.7 @RED - create in supabase mode returns persistent identity (not mock prefix)', async () => {
    const created = await firstValueFrom(service.create(validCreateDto({ nombre: 'KB007 create id check' })));
    expect(created.id).toBeTruthy();
    expect(created.id.startsWith('cliente-')).toBe(false);
  });
});

describe('KB-007.2 - Read Clientes (Supabase load/search/filter)', () => {
  let service: ClienteService;

  beforeEach(() => {
    service = new ClienteService();
    service.setProvider('supabase');
  });

  it('KB-007.2.1 @RED - wires a Supabase read query for customers', () => {
    const source = readClienteServiceSource();
    const hasReadQuery = /from\(['\"]customers['\"]\)[\s\S]*select\(/i.test(source)
      || /loadCustomersFromSupabase|getCustomersFromSupabase/i.test(source);

    expect(hasReadQuery).toBe(true);
  });

  it('KB-007.2.2 @RED - getAll() syncs items() with returned payload in supabase mode', async () => {
    const loaded = await firstValueFrom(service.getAll());
    expect(service.items()).toEqual(loaded);
  });

  it('KB-007.2.3 @RED - search supports nombre/apellido/telefono/email in one API', async () => {
    await firstValueFrom(service.getAll());

    const emailResult = await firstValueFrom(service.search('@example.com'));
    expect(emailResult.length).toBeGreaterThan(0);
  });

  it('KB-007.2.4 @RED - exposes optional VIP/active filter contract if domain supports it', () => {
    const filterPort = service as unknown as {
      filterBy?: (input: { vip?: boolean; active?: boolean }) => unknown;
      getByFilter?: (input: { vip?: boolean; active?: boolean }) => unknown;
    };

    const hasFilterApi = typeof filterPort.filterBy === 'function' || typeof filterPort.getByFilter === 'function';
    expect(hasFilterApi).toBe(true);
  });
});

describe('KB-007.3 - Update Cliente (Supabase + immutability)', () => {
  let service: ClienteService;

  beforeEach(async () => {
    service = new ClienteService();
    service.setProvider('supabase');
    await firstValueFrom(service.getAll());
  });

  it('KB-007.3.1 @RED - wires a Supabase update mutation for customers', () => {
    const source = readClienteServiceSource();
    const hasUpdateMutation = /from\(['\"]customers['\"]\)[\s\S]*update\(/i.test(source)
      || /updateCustomerInSupabase|updateClienteInSupabase/i.test(source);

    expect(hasUpdateMutation).toBe(true);
  });

  it('KB-007.3.2 @RED - update handles not-found with explicit domain code', () => {
    expect(() => service.update('cust-kb007-not-found', { nombre: 'No-op' })).toThrow(
      /CLIENTE_NOT_FOUND|CUSTOMER_NOT_FOUND/i
    );
  });

  it('KB-007.3.3 @RED - update preserves immutable fields (id, createdAt)', async () => {
    const created = await firstValueFrom(service.create(validCreateDto({ nombre: 'KB007 immutable seed' })));

    const maliciousPayload = {
      nombre: 'KB007 immutable updated',
      id: 'malicious-id-overwrite',
      createdAt: new Date('2000-01-01T00:00:00.000Z')
    } as unknown as Record<string, unknown>;

    const updated = await firstValueFrom(service.update(created.id, maliciousPayload as never));

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
  });
});

describe('KB-007.4 - Delete Cliente (constraints + Supabase behavior)', () => {
  let service: ClienteService;

  beforeEach(() => {
    service = new ClienteService();
    service.setProvider('supabase');
  });

  it('KB-007.4.1 @RED - wires delete path to Supabase (soft/hard per domain)', () => {
    const source = readClienteServiceSource();
    const hasDeleteMutation = /from\(['\"]customers['\"]\)[\s\S]*(delete|update)\(/i.test(source)
      || /softDeleteCustomer|hardDeleteCustomer|deleteCustomerInSupabase|deleteClienteInSupabase/i.test(source);

    expect(hasDeleteMutation).toBe(true);
  });

  it('KB-007.4.2 @RED - prevents delete when customer has active bookings', async () => {
    await expect(
      firstValueFrom(service.delete('cust-kb007-booked-active'))
    ).rejects.toThrow(/booking|turno|referenc|in use|en uso|activos/i);
  });
});

describe('KB-007.5 - History/relations (customer-booking)', () => {
  let service: ClienteService;

  beforeEach(async () => {
    service = new ClienteService();
    service.setProvider('supabase');
    await firstValueFrom(service.getAll());
  });

  it('KB-007.5.1 @RED - exposes customer-booking history metrics contract', async () => {
    const historyPort = service as unknown as {
      getHistoryMetrics?: (clienteId: string) => Promise<unknown> | unknown;
      getClienteHistory?: (clienteId: string) => Promise<unknown> | unknown;
    };

    const historyApi = historyPort.getHistoryMetrics ?? historyPort.getClienteHistory;
    expect(typeof historyApi).toBe('function');
  });
});

describe('KB-007.6 - Error handling & state', () => {
  let service: ClienteService;

  beforeEach(() => {
    service = new ClienteService();
  });

  it('KB-007.6.1 @RED - getAll in supabase mode toggles loading true->false', async () => {
    service.setProvider('supabase');

    const pending = firstValueFrom(service.getAll());
    expect(service.isLoading()).toBe(true);
    await pending;
    expect(service.isLoading()).toBe(false);
  });

  it('KB-007.6.2 @RED - service exposes network error state contract', () => {
    const errorSignal = service as unknown as { error: () => string | null };
    expect(typeof errorSignal.error).toBe('function');
  });

  it('KB-007.6.3 @RED - empty Supabase response must clear stale cached items', async () => {
    service.setProvider('mock');
    await firstValueFrom(service.getAll());
    expect(service.items().length).toBeGreaterThan(0);

    service.setProvider('supabase');
    const loaded = await firstValueFrom(service.getAll());

    if (loaded.length === 0) {
      expect(service.items()).toEqual([]);
    } else {
      expect(service.items()).toEqual(loaded);
    }
  });
});
