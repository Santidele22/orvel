import { z } from 'zod';
import { isValidArgentinaPhone } from '../../../core/validation/argentina-phone';

const instagramRegex = /^@[a-zA-Z0-9._]{1,30}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

function timeToMinutes(value: string): number {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}

function coerceNumber(fallback: number, min: number, message: string) {
  return z.preprocess((value) => {
    if (value == null || value === '') return fallback;
    if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
      return Number(value);
    }
    return value;
  }, z.number().min(min, message));
}

const optionalTimeSchema = z.union([
  z.literal(''),
  z.string().regex(timeRegex, 'Formato de hora inválido')
]).optional();

const workingDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(timeRegex, 'Formato de hora inválido'),
  end: z.string().regex(timeRegex, 'Formato de hora inválido'),
  start2: optionalTimeSchema,
  end2: optionalTimeSchema,
  intervals: z.array(z.object({
    start: z.string().regex(timeRegex, 'Formato de hora inválido'),
    end: z.string().regex(timeRegex, 'Formato de hora inválido')
  })).max(2).optional()
});

const configuracionSchema = z.object({
  businessName: z.preprocess((value) => (value == null ? '' : value), z.string().trim().min(1, 'Nombre del negocio requerido').max(80, 'Máximo 80 caracteres')),
  firstName: z.preprocess((value) => (value == null ? '' : value), z.string().trim().optional().or(z.literal(''))),
  lastName: z.preprocess((value) => (value == null ? '' : value), z.string().trim().optional().or(z.literal(''))),
  supportEmail: z.preprocess((value) => (value == null ? '' : value), z.string().trim().optional().or(z.literal(''))).refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Email inválido'
  }),
  phone: z.preprocess((value) => (value == null ? '' : value), z.string().trim().optional().or(z.literal(''))).refine((value) => !value || isValidArgentinaPhone(value), {
    message: 'Teléfono inválido'
  }),
  whatsapp: z.preprocess((value) => (value == null ? '' : value), z.string().trim().optional().or(z.literal(''))).refine((value) => !value || isValidArgentinaPhone(value), {
    message: 'WhatsApp inválido'
  }),
  instagram: z.preprocess((value) => (value == null ? '' : value), z.string().trim().optional().or(z.literal(''))).refine((value) => !value || instagramRegex.test(value), {
    message: 'Instagram inválido'
  }),
  logoUrl: z.preprocess((value) => (value == null ? '' : value), z.string().optional()),
  coverUrl: z.preprocess((value) => (value == null ? '' : value), z.string().optional()),
  bufferMinutes: coerceNumber(0, 0, 'Debe ser mayor o igual a 0'),
  minNoticeMinutes: coerceNumber(0, 0, 'Debe ser mayor o igual a 0'),
  slotIntervalMinutes: coerceNumber(0, 0, 'Debe ser mayor o igual a 0'),
  cancelationGracePeriod: coerceNumber(0, 0, 'Debe ser mayor o igual a 0'),
  maxAdvanceDays: coerceNumber(1, 1, 'Debe ser mayor o igual a 1'),
  cleanupTimeMinutes: coerceNumber(0, 0, 'Debe ser mayor o igual a 0'),
  capacity: coerceNumber(1, 1, 'Debe ser mayor o igual a 1'),
  workingHours: z.record(z.string(), workingDaySchema)
    .refine((days) => Object.values(days).every((day) => {
      if (!day.enabled) return true;
      return timeToMinutes(day.start) < timeToMinutes(day.end);
    }), { message: 'El horario de apertura debe ser anterior al cierre' })
    .refine((days) => Object.values(days).every((day) => {
      if (!day.enabled) return true;
      const start2 = day.start2?.trim() ?? '';
      const end2 = day.end2?.trim() ?? '';
      if (!start2 && !end2) return true;
      if (!start2 || !end2) return false;
      return timeToMinutes(start2) < timeToMinutes(end2)
        && timeToMinutes(start2) >= timeToMinutes(day.end);
    }), { message: 'El segundo intervalo debe ser posterior y no superponerse' })
});

export type ConfiguracionValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

export function validateConfiguracionForm(input: unknown): ConfiguracionValidationResult {
  const parsed = configuracionSchema.safeParse(input);

  if (parsed.success) {
    return { isValid: true, fieldErrors: {} };
  }

  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !fieldErrors[field]) {
      fieldErrors[field] = issue.message;
    }
  }

  return {
    isValid: false,
    fieldErrors
  };
}
