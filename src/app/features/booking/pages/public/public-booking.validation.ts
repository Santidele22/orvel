import { z } from 'zod';

export type PublicBookingFormInput = {
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  serviceId: string;
  slotIso: string;
};

export type PublicBookingValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

const consecutiveDotsPattern = /\.\./;

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

  if (digits.length < 8 || digits.length > 12) {
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

const publicBookingSchema = z.object({
  firstName: z.string().trim().min(1, 'Por favor ingresa tu nombre'),
  lastName: z.string().trim().min(1, 'Por favor ingresa tu apellido'),
  whatsapp: z
    .string()
    .trim()
    .min(1, 'Por favor ingresa tu número de WhatsApp')
    .refine((value) => isValidArgentinaPhone(value), 'Por favor ingresa un número válido de Argentina (ej: 11 1234 5678)'),
  email: z
    .string()
    .trim()
    .min(1, 'Por favor ingresa tu correo electrónico')
    .email('Por favor ingresa un correo válido')
    .refine((value) => !consecutiveDotsPattern.test(value), 'Por favor ingresa un correo válido'),
  serviceId: z.string().trim().min(1, 'Por favor selecciona un servicio'),
  slotIso: z.string().trim().min(1, 'Por favor selecciona un horario disponible')
});

const fieldKeyMap: Record<string, string> = {
  serviceId: 'service',
  slotIso: 'slot'
};

export function validatePublicBookingForm(input: PublicBookingFormInput): PublicBookingValidationResult {
  const parsed = publicBookingSchema.safeParse(input);
  if (parsed.success) {
    return { isValid: true, fieldErrors: {} };
  }

  const fieldErrors: Record<string, string> = {};

  for (const issue of parsed.error.issues) {
    const rawPath = String(issue.path[0] ?? '');
    const fieldKey = fieldKeyMap[rawPath] ?? rawPath;

    if (!fieldKey || fieldErrors[fieldKey]) {
      continue;
    }

    fieldErrors[fieldKey] = issue.message;
  }

  return {
    isValid: false,
    fieldErrors
  };
}
