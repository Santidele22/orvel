import { z } from 'zod';

const phoneRegex = /^\+54\s?9\s?\d{2}\s?\d{4}\s?\d{4}$/;
const instagramRegex = /^@[a-zA-Z0-9._]{1,30}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const workingDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(timeRegex, 'Formato de hora inválido'),
  end: z.string().regex(timeRegex, 'Formato de hora inválido')
});

const configuracionSchema = z.object({
  businessName: z.string().trim().min(1, 'Nombre del negocio requerido').max(80, 'Máximo 80 caracteres'),
  firstName: z.string().trim().min(1, 'Nombre requerido'),
  lastName: z.string().trim().min(1, 'Apellido requerido'),
  supportEmail: z.string().trim().optional().or(z.literal('')).refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Email inválido'
  }),
  phone: z.string().trim().optional().or(z.literal('')).refine((value) => !value || phoneRegex.test(value), {
    message: 'Teléfono inválido'
  }),
  whatsapp: z.string().trim().optional().or(z.literal('')).refine((value) => !value || phoneRegex.test(value), {
    message: 'WhatsApp inválido'
  }),
  instagram: z.string().trim().optional().or(z.literal('')).refine((value) => !value || instagramRegex.test(value), {
    message: 'Instagram inválido'
  }),
  logoUrl: z.string().trim().optional().or(z.literal('')).refine((value) => {
    if (!value) return true;
    return /^https?:\/\//.test(value) && z.string().url().safeParse(value).success;
  }, {
    message: 'URL de logo inválida'
  }),
  coverUrl: z.string().trim().optional().or(z.literal('')).refine((value) => {
    if (!value) return true;
    return /^https?:\/\//.test(value) && z.string().url().safeParse(value).success;
  }, {
    message: 'URL de portada inválida'
  }),
  bufferMinutes: z.number().min(0, 'Debe ser mayor o igual a 0'),
  minNoticeMinutes: z.number().min(0, 'Debe ser mayor o igual a 0'),
  slotIntervalMinutes: z.number().min(0, 'Debe ser mayor o igual a 0'),
  cancelationGracePeriod: z.number().min(0, 'Debe ser mayor o igual a 0'),
  maxAdvanceDays: z.number().min(1, 'Debe ser mayor o igual a 1'),
  cleanupTimeMinutes: z.number().min(0, 'Debe ser mayor o igual a 0'),
  capacity: z.number().min(1, 'Debe ser mayor o igual a 1'), // Employee count for bookings
  workingHours: z.record(z.string(), workingDaySchema)
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
