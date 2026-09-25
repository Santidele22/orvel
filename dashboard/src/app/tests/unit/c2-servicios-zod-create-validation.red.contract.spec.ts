import { describe, expect, it } from 'vitest';

type CreateCategoryInput = {
  nombre: string;
};

type CreateServicioInput = {
  nombre: string;
  categoria: string;
  duracionMinutos: number;
  precio: number;
  activo: boolean;
};

type ServiciosValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

type ServiciosValidationModule = {
  validateCreateCategory: (input: CreateCategoryInput) => ServiciosValidationResult;
  validateCreateServicio: (input: CreateServicioInput) => ServiciosValidationResult;
};

async function loadServiciosValidationModule(): Promise<ServiciosValidationModule> {
  try {
    const mod = await import('../../features/servicios/pages/servicios.validation');
    return mod as ServiciosValidationModule;
  } catch {
    throw new Error(
      'TODO(Magnus): falta src/app/pages/dashboard/servicios/servicios.validation.ts con validateCreateCategory() y validateCreateServicio()'
    );
  }
}

const validCategory: CreateCategoryInput = {
  nombre: 'Masajes'
};

const validServicio: CreateServicioInput = {
  nombre: 'Masaje relajante 60 min',
  categoria: 'Masajes',
  duracionMinutos: 60,
  precio: 35000,
  activo: true
};

describe('C2 - Servicios create Zod validation RED contract', () => {
  describe('validateCreateCategory()', () => {
    it('rejects blank and oversized category names', async () => {
      const { validateCreateCategory } = await loadServiciosValidationModule();

      const blank = validateCreateCategory({ nombre: '   ' });
      const tooLong = validateCreateCategory({ nombre: 'x'.repeat(61) });

      expect(blank.isValid).toBe(false);
      expect(blank.fieldErrors.nombre).toBeTypeOf('string');

      expect(tooLong.isValid).toBe(false);
      expect(tooLong.fieldErrors.nombre).toBeTypeOf('string');
    });

    it('accepts a valid category payload', async () => {
      const { validateCreateCategory } = await loadServiciosValidationModule();

      const result = validateCreateCategory(validCategory);

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors.nombre).toBeUndefined();
    });
  });

  describe('validateCreateServicio()', () => {
    it('rejects required and range violations for create service payload', async () => {
      const { validateCreateServicio } = await loadServiciosValidationModule();

      const result = validateCreateServicio({
        ...validServicio,
        nombre: ' ',
        categoria: '',
        duracionMinutos: 4,
        precio: -1
      });

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.nombre).toBeTypeOf('string');
      expect(result.fieldErrors.categoria).toBeTypeOf('string');
      expect(result.fieldErrors.duracionMinutos).toBeTypeOf('string');
      expect(result.fieldErrors.precio).toBeTypeOf('string');
    });

    it('rejects service name above 60 chars and duration above 480', async () => {
      const { validateCreateServicio } = await loadServiciosValidationModule();

      const result = validateCreateServicio({
        ...validServicio,
        nombre: 'x'.repeat(61),
        duracionMinutos: 481
      });

      expect(result.isValid).toBe(false);
      expect(result.fieldErrors.nombre).toBeTypeOf('string');
      expect(result.fieldErrors.duracionMinutos).toBeTypeOf('string');
    });

    it('accepts a valid service payload', async () => {
      const { validateCreateServicio } = await loadServiciosValidationModule();

      const result = validateCreateServicio(validServicio);

      expect(result.isValid).toBe(true);
      expect(result.fieldErrors.nombre).toBeUndefined();
      expect(result.fieldErrors.categoria).toBeUndefined();
      expect(result.fieldErrors.duracionMinutos).toBeUndefined();
      expect(result.fieldErrors.precio).toBeUndefined();
    });
  });
});
