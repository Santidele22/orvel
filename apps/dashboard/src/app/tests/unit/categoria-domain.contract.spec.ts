import { beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { ServicioService } from '../../services/servicio.service';

type CategoriaRecord = {
  id: string;
  nombre: string;
  slug: string;
  activa: boolean;
  serviciosCount: number;
};

type CategoriaDomainPort = {
  listCategorias(): CategoriaRecord[];
  createCategoria(input: { nombre: string }): CategoriaRecord;
  renameCategoria(categoriaId: string, nuevoNombre: string): CategoriaRecord;
  toggleCategoriaActiva(categoriaId: string, activa: boolean): CategoriaRecord;
  deleteCategoria(categoriaId: string): { ok: true };
};

describe('Sprint 1 - Category domain contract (mock mode)', () => {
  let servicioService: ServicioService;
  let categoriaPort: Partial<CategoriaDomainPort>;

  beforeEach(async () => {
    servicioService = new ServicioService();
    categoriaPort = servicioService as unknown as Partial<CategoriaDomainPort>;
    await firstValueFrom(servicioService.getAll());
  });

  it('exposes a category catalog store with metadata for UI filters', () => {
    // TODO(Aurora): implementar CategoriaService/store y conectar este contrato.
    expect(typeof categoriaPort.listCategorias).toBe('function');

    const categorias = categoriaPort.listCategorias!();
    expect(categorias.length).toBeGreaterThan(0);
    expect(categorias[0]).toMatchObject({
      id: expect.any(String),
      nombre: expect.any(String),
      slug: expect.any(String),
      activa: expect.any(Boolean),
      serviciosCount: expect.any(Number)
    });
  });

  it('creates categories with trimmed names and blocks duplicates (case-insensitive)', () => {
    // TODO(Aurora): contrato para alta de categorías desde UI de Servicios.
    expect(typeof categoriaPort.createCategoria).toBe('function');

    const creada = categoriaPort.createCategoria!({ nombre: '  Depilación  ' });
    expect(creada.nombre).toBe('Depilación');

    expect(() => categoriaPort.createCategoria!({ nombre: 'depilación' })).toThrow(/duplicada|existente/i);
  });

  it('prevents deleting categories that still have active services assigned', () => {
    // TODO(Aurora): evitar borrar categorías con servicios activos para no romper listados.
    expect(typeof categoriaPort.deleteCategoria).toBe('function');

    const categorias = categoriaPort.listCategorias!();
    const categoriaConServicios = categorias.find(c => c.serviciosCount > 0);
    expect(categoriaConServicios).toBeDefined();

    expect(() => categoriaPort.deleteCategoria!(categoriaConServicios!.id)).toThrow(/servicios activos|en uso/i);
  });

  it('allows toggling category active state and keeps service filters consistent', async () => {
    // TODO(Aurora): al desactivar categoría, sus servicios no deben aparecer como activos en UI.
    expect(typeof categoriaPort.toggleCategoriaActiva).toBe('function');

    const categoria = categoriaPort.listCategorias!().find(c => c.nombre === 'Uñas');
    expect(categoria).toBeDefined();

    categoriaPort.toggleCategoriaActiva!(categoria!.id, false);
    const serviciosUñas = await firstValueFrom(servicioService.getByCategoria('Uñas'));
    expect(serviciosUñas).toHaveLength(0);
  });
});
