/**
 * KB-006: Servicios CRUD (Full) - TDD Guard Tests
 *
 * RED contract: these tests should fail until ServicioService implements
 * full Supabase-backed CRUD, robust validation, and state/error handling.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ServicioService } from '../../services/servicio.service';
import type { CreateServicioDTO } from '../../models/servicio.model';

function readServicioServiceSource(): string {
  const tsPath = resolve(process.cwd(), 'src/app/features/servicios/data-access/servicio.service.ts');
  return existsSync(tsPath) ? readFileSync(tsPath, 'utf-8') : '';
}

function forceDegradedSupabaseFallback(service: ServicioService): void {
  (service as unknown as { getSupabaseClient: () => null }).getSupabaseClient = () => null;
}

const validCreateDto = (overrides: Partial<CreateServicioDTO> = {}): CreateServicioDTO => ({
  nombre: 'Masaje descontracturante',
  descripcion: 'Servicio de prueba KB-006',
  categoria: 'Masajes',
  duracionMinutos: 60,
  precio: 15000,
  activo: true,
  ...overrides
});

describe('KB-006.1 - Create Servicio (Supabase + validation)', () => {
  let service: ServicioService;

  beforeEach(() => {
    service = new ServicioService();
    service.setProvider('supabase');
    forceDegradedSupabaseFallback(service);
  });

  it('KB-006.1.1 @RED - wires a Supabase create path for servicios', () => {
    const source = readServicioServiceSource();

    const hasSupabaseClient = /@supabase\/supabase-js|createClient\(/i.test(source);
    const hasCreateMutation = /from\(['\"](services|servicios)['\"]\)[\s\S]*insert\(/i.test(source)
      || /createServicio|createService|insertServicio/i.test(source);

    expect(hasSupabaseClient).toBe(true);
    expect(hasCreateMutation).toBe(true);
  });

  it('KB-006.1.2 @RED - rejects create when nombre is missing', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ nombre: '   ' })))
    ).rejects.toThrow(/nombre|required|inválido/i);
  });

  it('KB-006.1.3 @RED - rejects create when categoria is missing', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ categoria: '   ' })))
    ).rejects.toThrow(/categoria|required|inválido/i);
  });

  it('KB-006.1.4 @RED - rejects create when duration is invalid', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ duracionMinutos: 0 })))
    ).rejects.toThrow(/duracion|duración|invalid|inválido/i);
  });

  it('KB-006.1.5 @RED - rejects create when price is invalid', async () => {
    await expect(
      firstValueFrom(service.create(validCreateDto({ precio: -1 })))
    ).rejects.toThrow(/precio|price|invalid|inválido/i);
  });

  it('KB-006.1.6 @RED - creates servicio with persistent Supabase identity (not mock prefix)', async () => {
    const created = await firstValueFrom(service.create(validCreateDto({ nombre: 'KB006 create id check' })));
    expect(created.id).toBeTruthy();
    expect(created.id.startsWith('servicio-')).toBe(false);
  });
});

describe('KB-006.2 - Read Servicios (Supabase load/filter/search)', () => {
  let service: ServicioService;

  beforeEach(() => {
    service = new ServicioService();
    service.setProvider('mock');
  });

  it('KB-006.2.1 @RED - wires a Supabase read path for servicios', () => {
    const source = readServicioServiceSource();
    const hasReadQuery = /from\(['\"](services|servicios)['\"]\)[\s\S]*select\(/i.test(source)
      || /loadServiciosFromSupabase|getServiciosFromSupabase/i.test(source);

    expect(hasReadQuery).toBe(true);
  });

  it('KB-006.2.2 @RED - getAll() in supabase mode syncs items() with returned payload (prevents stale state)', async () => {
    service.setProvider('mock');
    await firstValueFrom(service.getAll());
    expect(service.items().length).toBeGreaterThan(0);

    service.setProvider('supabase');
    const loaded = await firstValueFrom(service.getAll());

    expect(service.items()).toEqual(loaded);
  });

  it('KB-006.2.3 @RED - supports search by nombre/categoria (case + accents insensitive)', async () => {
    await firstValueFrom(service.getAll());

    const searchPort = service as unknown as {
      search: (query: string) => Promise<unknown> | unknown;
    };

    expect(typeof searchPort.search).toBe('function');

    const result = await Promise.resolve(searchPort.search('masaje')) as Array<{ nombre: string; categoria: string }>;
    expect(result.length).toBeGreaterThan(0);
    expect(result.some(item => /masaje/i.test(item.nombre) || /masaje/i.test(item.categoria))).toBe(true);
  });

  it('KB-006.2.4 @RED - category filter is normalized (accent insensitive)', async () => {
    const created = await firstValueFrom(service.create(validCreateDto({ categoria: 'Depilación', nombre: 'Perfilado KB006' })));
    expect(created.id).toBeTruthy();

    const filtered = await firstValueFrom(service.getByCategoria('depilacion'));
    expect(filtered.length).toBeGreaterThan(0);
  });
});

describe('KB-006.3 - Update Servicio (Supabase + immutability)', () => {
  let service: ServicioService;

  beforeEach(async () => {
    service = new ServicioService();
    service.setProvider('supabase');
    forceDegradedSupabaseFallback(service);
    await firstValueFrom(service.getAll());
  });

  it('KB-006.3.1 @RED - wires a Supabase update mutation for servicios', () => {
    const source = readServicioServiceSource();
    const hasUpdateMutation = /from\(['\"](services|servicios)['\"]\)[\s\S]*update\(/i.test(source)
      || /rpc\(['\"][^'\"]*servicio[^'\"]*update/i.test(source);

    expect(hasUpdateMutation).toBe(true);
  });

  it('KB-006.3.2 @RED - update handles not-found with explicit domain error', async () => {
    expect(() => service.update('svc-kb006-not-found', { nombre: 'No-op' })).toThrow(
      /SERVICIO_NOT_FOUND|SVC_NOT_FOUND/i
    );
  });

  it('KB-006.3.3 @RED - update preserves immutable fields (id, createdAt)', async () => {
    const created = await firstValueFrom(service.create(validCreateDto({ nombre: 'KB006 immutable seed' })));

    const hackedPayload = {
      nombre: 'KB006 immutable updated',
      id: 'malicious-id-overwrite',
      createdAt: new Date('2000-01-01T00:00:00.000Z')
    } as unknown as Record<string, unknown>;

    const updated = await firstValueFrom(service.update(created.id, hackedPayload as never));

    expect(updated.id).toBe(created.id);
    expect(updated.createdAt.getTime()).toBe(created.createdAt.getTime());
  });
});

describe('KB-006.4 - Delete Servicio (constraints + Supabase behavior)', () => {
  let service: ServicioService;

  beforeEach(() => {
    service = new ServicioService();
    service.setProvider('supabase');
    forceDegradedSupabaseFallback(service);
  });

  it('KB-006.4.1 @RED - wires delete path to Supabase (soft/hard domain behavior)', () => {
    const source = readServicioServiceSource();
    const hasDeleteMutation = /from\(['\"](services|servicios)['\"]\)[\s\S]*delete\(/i.test(source)
      || /softDelete|hardDelete|deleteServicio|deleteService/i.test(source);

    expect(hasDeleteMutation).toBe(true);
  });

  it('KB-006.4.2 @RED - prevents delete when servicio has active bookings references', async () => {
    await expect(
      firstValueFrom(service.delete('svc-kb006-booked-active'))
    ).rejects.toThrow(/booking|turno|referenc|in use|en uso|activos/i);
  });
});

describe('KB-006.5 - Category CRUD', () => {
  let service: ServicioService;

  beforeEach(async () => {
    service = new ServicioService();
    service.setProvider('mock');
    await firstValueFrom(service.getAll());
  });

  it('KB-006.5.1 @RED - wires category CRUD to Supabase source', () => {
    const source = readServicioServiceSource();
    const hasCategoryTablePath = /from\(['\"](service_categories|servicio_categorias|categorias_servicio)['\"]\)/i.test(source)
      || /rpc\(['\"][^'\"]*(categor|category)[^'\"]*/i.test(source);

    expect(hasCategoryTablePath).toBe(true);
  });

  it('KB-006.5.2 @RED - createCategoria prevents duplicates using normalized name (trim/case/accent)', () => {
    service.createCategoria({ nombre: '  Faciales KB006  ' });

    expect(() => service.createCategoria({ nombre: 'faciales kb006' })).toThrow(/duplicada|existente|duplicate/i);
  });
});

describe('KB-006.6 - Error handling & state', () => {
  let service: ServicioService;

  beforeEach(async () => {
    service = new ServicioService();
    service.setProvider('mock');
    await firstValueFrom(service.getAll());
  });

  it('KB-006.6.1 @RED - supabase getAll sets loading=true during fetch and false on completion', async () => {
    service.setProvider('supabase');

    const pending = firstValueFrom(service.getAll());
    expect(service.isLoading()).toBe(true);
    await pending;
    expect(service.isLoading()).toBe(false);
  });

  it('KB-006.6.2 @RED - supabase empty response clears stale cached items', async () => {
    service.setProvider('supabase');
    const loaded = await firstValueFrom(service.getAll());

    if (loaded.length === 0) {
      expect(service.items()).toEqual([]);
    } else {
      expect(service.items()).toEqual(loaded);
    }
  });

  it('KB-006.6.3 @RED - service exposes network error state contract', () => {
    const errorSignal = service as unknown as { error: () => string | null };
    expect(typeof errorSignal.error).toBe('function');
  });
});
