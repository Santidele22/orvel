import { z } from 'zod';

const instagramRegex = /^@[a-zA-Z0-9._]{1,30}$/;
const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidArgentinaPhone(value: string): boolean {
  const raw = value.trim();
  if (!raw) return false;

  if (!/^[+\d\s\-()]+$/.test(raw)) {
    return false;
  }

  if (raw.startsWith('+') && !raw.startsWith('+54')) {
    return false;
  }

  if (/^\+54\s*0/.test(raw)) {
    return false;
  }

  let digits = raw.replace(/\D/g, '');
  if (!digits) return false;

  if (digits.startsWith('54')) {
    digits = digits.slice(2);
  }

  if (digits.startsWith('9')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('0')) {
    digits = digits.slice(1);
  }

  if (digits.startsWith('11')) {
    let subscriber = digits.slice(2);
    if (subscriber.startsWith('15')) {
      subscriber = subscriber.slice(2);
    }

    return subscriber.length === 8;
  }

  if (digits.length !== 10) {
    return false;
  }

  for (let areaLen = 2; areaLen <= 4; areaLen++) {
    const subscriberLen = digits.length - areaLen;
    if (subscriberLen >= 6 && subscriberLen <= 8) {
      return true;
    }
  }

  return false;
}

const workingDaySchema = z.object({
  enabled: z.boolean(),
  start: z.string().regex(timeRegex, 'Formato de hora inválido'),
  end: z.string().regex(timeRegex, 'Formato de hora inválido')
});

const configuracionSchema = z.object({
  businessName: z.string().trim().min(1, 'Nombre del negocio requerido').max(80, 'Máximo 80 caracteres'),
  firstName: z.string().trim().optional().or(z.literal('')),
  lastName: z.string().trim().optional().or(z.literal('')),
  supportEmail: z.string().trim().optional().or(z.literal('')).refine((value) => !value || z.string().email().safeParse(value).success, {
    message: 'Email inválido'
  }),
  phone: z.string().trim().optional().or(z.literal('')).refine((value) => !value || isValidArgentinaPhone(value), {
    message: 'Teléfono inválido'
  }),
  whatsapp: z.string().trim().optional().or(z.literal('')).refine((value) => !value || isValidArgentinaPhone(value), {
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
    .refine((days) => Object.values(days).every((day) => {
      if (!day.enabled) return true;
      const [startHour, startMinute] = day.start.split(':').map(Number);
      const [endHour, endMinute] = day.end.split(':').map(Number);
      return startHour * 60 + startMinute < endHour * 60 + endMinute;
    }), { message: 'El horario de apertura debe ser anterior al cierre' })
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
