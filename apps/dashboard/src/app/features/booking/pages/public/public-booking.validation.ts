import { z } from 'zod';
import { isValidArgentinaPhone } from '../../../../core/validation/argentina-phone';

export type PublicBookingFormInput = {
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  notes?: string;
  serviceId: string;
  slotIso: string;
};

export type PublicBookingValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

const consecutiveDotsPattern = /\.\./;

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
  notes: z.string().trim().optional(),
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
