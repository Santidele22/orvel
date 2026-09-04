import { z } from 'zod';

export const createCategorySchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(60, 'Máximo 60 caracteres.')
});

export const createServicioSchema = z.object({
  nombre: z.string().trim().min(1, 'El nombre es obligatorio.').max(60, 'Máximo 60 caracteres.'),
  categoria: z.string().trim().min(1, 'La categoría es obligatoria.'),
  duracionMinutos: z.coerce.number().min(5, 'Duración mínima: 5 min.').max(480, 'Duración máxima: 480 min.'),
  precio: z.coerce.number().min(0, 'El precio no puede ser negativo.'),
  depositPercent: z.coerce.number().refine((value) => [0, 25, 50, 100].includes(value), {
    message: 'La seña debe ser 0, 25, 50 o 100.'
  }).optional().default(0),
  activo: z.boolean().optional().default(true)
});

export function getFieldErrors(result: z.ZodSafeParseError<unknown>): Record<string, string> {
  const flattened = result.error.flatten().fieldErrors as Record<string, string[] | undefined>;
  const output: Record<string, string> = {};

  for (const [key, value] of Object.entries(flattened)) {
    if (value?.length) {
      output[key] = value[0] ?? '';
    }
  }

  return output;
}

type ServiciosValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

export function validateCreateCategory(input: unknown): ServiciosValidationResult {
  const parsed = createCategorySchema.safeParse(input);
  if (parsed.success) {
    return { isValid: true, fieldErrors: {} };
  }

  return { isValid: false, fieldErrors: getFieldErrors(parsed) };
}

export function validateCreateServicio(input: unknown): ServiciosValidationResult {
  const parsed = createServicioSchema.safeParse(input);
  if (parsed.success) {
    return { isValid: true, fieldErrors: {} };
  }

  return { isValid: false, fieldErrors: getFieldErrors(parsed) };
}
