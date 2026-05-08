import { describe, expect, it } from 'vitest';

type PublicBookingFormInput = {
  firstName: string;
  lastName: string;
  whatsapp: string;
  email: string;
  serviceId: string;
  slotIso: string;
};

type PublicBookingValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

type PublicBookingValidationModule = {
  validatePublicBookingForm: (input: PublicBookingFormInput) => PublicBookingValidationResult;
};

async function loadPublicBookingValidationModule(): Promise<PublicBookingValidationModule> {
  try {
    const mod = await import('../../pages/booking/public-booking.validation');
    return mod as PublicBookingValidationModule;
  } catch {
    throw new Error(
      'TODO(Magnus): falta src/app/pages/booking/public-booking.validation.ts con validatePublicBookingForm()'
    );
  }
}

const validBaseInput: PublicBookingFormInput = {
  firstName: 'Santi',
  lastName: 'Pérez',
  whatsapp: '+54 9 11 1234 5678',
  email: 'santi.perez@example.com',
  serviceId: 'svc-color',
  slotIso: '2026-05-02T14:30:00.000Z'
};

describe('Public booking validation RED contract (Zod migration)', () => {
  it('accepts valid Argentina WhatsApp/phone variants', async () => {
    const { validatePublicBookingForm } = await loadPublicBookingValidationModule();
    const validPhones = [
      '+54 9 11 1234 5678',
      '+5491112345678',
      '5491112345678',
      '11 1234-5678',
      '011 15 1234 5678',
      '351 123 4567',
      '+54 351 123 4567'
    ];

    for (const phone of validPhones) {
      const result = validatePublicBookingForm({ ...validBaseInput, whatsapp: phone });
      expect(result.fieldErrors.whatsapp).toBeUndefined();
      expect(result.isValid).toBe(true);
    }
  });

  it('rejects invalid or non-Argentina phone numbers', async () => {
    const { validatePublicBookingForm } = await loadPublicBookingValidationModule();
    const invalidPhones = [
      '',
      '12345',
      '+1 415 555 2671',
      '+57 300 123 4567',
      '+54 11 123',
      'abcdefg',
      '+54 0 11 1234 5678'
    ];

    for (const phone of invalidPhones) {
      const result = validatePublicBookingForm({ ...validBaseInput, whatsapp: phone });
      expect(result.fieldErrors.whatsapp).toBeTypeOf('string');
      expect(result.isValid).toBe(false);
    }
  });

  it('accepts valid emails and rejects invalid ones', async () => {
    const { validatePublicBookingForm } = await loadPublicBookingValidationModule();
    const validEmails = ['user@example.com', 'name.surname+tag@sub.domain.com', 'a_b-c@x.io'];
    const invalidEmails = ['invalid', 'missing-at.com', 'x@y', 'john..doe@example.com', ''];

    for (const email of validEmails) {
      const result = validatePublicBookingForm({ ...validBaseInput, email });
      expect(result.fieldErrors.email).toBeUndefined();
    }

    for (const email of invalidEmails) {
      const result = validatePublicBookingForm({ ...validBaseInput, email });
      expect(result.fieldErrors.email).toBeTypeOf('string');
      expect(result.isValid).toBe(false);
    }
  });

  it('maps required field failures to specific field errors', async () => {
    const { validatePublicBookingForm } = await loadPublicBookingValidationModule();

    const result = validatePublicBookingForm({
      firstName: ' ',
      lastName: '',
      whatsapp: '',
      email: '',
      serviceId: '',
      slotIso: ''
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.firstName).toBeTypeOf('string');
    expect(result.fieldErrors.lastName).toBeTypeOf('string');
    expect(result.fieldErrors.whatsapp).toBeTypeOf('string');
    expect(result.fieldErrors.email).toBeTypeOf('string');
    expect(result.fieldErrors.service).toBeTypeOf('string');
    expect(result.fieldErrors.slot).toBeTypeOf('string');
  });

  it('blocks submit when form is invalid', async () => {
    const { validatePublicBookingForm } = await loadPublicBookingValidationModule();

    const invalid = validatePublicBookingForm({ ...validBaseInput, serviceId: '' });
    const valid = validatePublicBookingForm(validBaseInput);

    expect(invalid.isValid).toBe(false);
    expect(invalid.fieldErrors.service).toBeTypeOf('string');
    expect(valid.isValid).toBe(true);
    expect(Object.keys(valid.fieldErrors)).toEqual([]);
  });
});
