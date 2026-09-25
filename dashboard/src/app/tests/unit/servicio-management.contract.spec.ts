import { beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { ServicioService } from '../../services/servicio.service';

type ServicioFormValidatorModule = {
  validateServicioDraft: (input: {
    nombre: string;
    categoria: string;
    duracionMinutos: number;
    precio: number;
    activo: boolean;
  }) => {
    valid: boolean;
    errors: Record<string, string[]>;
  };
};

async function loadServicioFormValidator(): Promise<ServicioFormValidatorModule | null> {
  try {
    const module = await import('../../validators/servicio-form.validator');
    return module as ServicioFormValidatorModule;
  } catch {
    return null;
  }
}

describe('Sprint 1 - Service management contract (mock mode)', () => {
  let servicioService: ServicioService;

  beforeEach(async () => {
    servicioService = new ServicioService();
    servicioService.setProvider('mock');
    await firstValueFrom(servicioService.getAll());
  });

  it('keeps category assignment discoverable by category and active filters', async () => {
    const creada = await firstValueFrom(
      servicioService.create({
        nombre: 'Masaje descontracturante',
        descripcion: 'Servicio de prueba Sprint 1',
        categoria: 'Masajes',
        duracionMinutos: 60,
        precio: 12000,
        activo: true
      })
    );

    const categoria = await firstValueFrom(servicioService.getByCategoria('Masajes'));
    const activos = await firstValueFrom(servicioService.getActivos());

    expect(categoria.some(s => s.id === creada.id)).toBe(true);
    expect(activos.some(s => s.id === creada.id)).toBe(true);
  });

  it('removes services from active list when set as inactive', async () => {
    const created = await firstValueFrom(
      servicioService.create({
        nombre: 'Servicio temporal',
        categoria: 'Otro',
        duracionMinutos: 30,
        precio: 2500,
        activo: true
      })
    );

    await firstValueFrom(servicioService.update(created.id, { activo: false }));
    const activos = await firstValueFrom(servicioService.getActivos());

    expect(activos.some(s => s.id === created.id)).toBe(false);
  });

  it('blocks invalid values at form-validator layer before hitting service create/update', async () => {
    // TODO(Aurora): implementar validator en src/app/validators/servicio-form.validator.ts
    const validator = await loadServicioFormValidator();
    expect(validator, 'Missing servicio-form.validator contract module').not.toBeNull();

    const invalid = validator!.validateServicioDraft({
      nombre: ' ',
      categoria: 'Uñas',
      duracionMinutos: 0,
      precio: -1,
      activo: true
    });

    expect(invalid.valid).toBe(false);
    expect(invalid.errors.nombre?.length ?? 0).toBeGreaterThan(0);
    expect(invalid.errors.duracionMinutos?.length ?? 0).toBeGreaterThan(0);
    expect(invalid.errors.precio?.length ?? 0).toBeGreaterThan(0);
  });
});
