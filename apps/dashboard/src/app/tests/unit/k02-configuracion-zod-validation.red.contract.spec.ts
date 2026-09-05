import { describe, expect, it } from 'vitest';

type ConfiguracionWorkingDay = {
  enabled: boolean;
  start: string;
  end: string;
  start2?: string;
  end2?: string;
  intervals?: Array<{ start: string; end: string }>;
};

type ConfiguracionValidationInput = {
  businessName: string;
  firstName: string;
  lastName: string;
  supportEmail: string;
  phone: string;
  whatsapp: string;
  instagram: string;
  logoUrl: string;
  coverUrl: string;
  bufferMinutes: number;
  minNoticeMinutes: number;
  slotIntervalMinutes: number;
  cancelationGracePeriod: number;
  maxAdvanceDays: number;
  cleanupTimeMinutes: number;
  capacity: number;
  workingHours: Record<string, ConfiguracionWorkingDay>;
};

type ConfiguracionValidationResult = {
  isValid: boolean;
  fieldErrors: Record<string, string>;
};

type ConfiguracionValidationModule = {
  validateConfiguracionForm: (input: ConfiguracionValidationInput) => ConfiguracionValidationResult;
};

async function loadConfiguracionValidationModule(): Promise<ConfiguracionValidationModule> {
  try {
    const mod = await import('../../features/settings/pages/configuracion.validation');
    return mod as ConfiguracionValidationModule;
  } catch {
    throw new Error(
      'TODO(Magnus): falta src/app/features/settings/pages/configuracion.validation.ts con validateConfiguracionForm()'
    );
  }
}

const validWorkingHours: Record<string, ConfiguracionWorkingDay> = {
  monday: { enabled: true, start: '09:00', end: '18:00' },
  tuesday: { enabled: true, start: '09:00', end: '18:00' },
  wednesday: { enabled: true, start: '09:00', end: '18:00' },
  thursday: { enabled: true, start: '09:00', end: '18:00' },
  friday: { enabled: true, start: '09:00', end: '18:00' },
  saturday: { enabled: true, start: '10:00', end: '14:00' },
  sunday: { enabled: false, start: '00:00', end: '00:00' }
};

const validBaseInput: ConfiguracionValidationInput = {
  businessName: 'Salón Zen Palermo',
  firstName: 'Santi',
  lastName: 'Pérez',
  supportEmail: 'hola@salonzen.com',
  phone: '+54 9 11 1234 5678',
  whatsapp: '+54 9 11 1234 5678',
  instagram: '@salonzen',
  logoUrl: 'https://cdn.example.com/logo.png',
  coverUrl: 'https://cdn.example.com/cover.jpg',
  bufferMinutes: 15,
  minNoticeMinutes: 120,
  slotIntervalMinutes: 30,
  cancelationGracePeriod: 24,
  maxAdvanceDays: 90,
  cleanupTimeMinutes: 0,
  capacity: 1,
  workingHours: validWorkingHours
};

describe('K02 - Configuración Zod validation RED contract', () => {
  it('rejects required fields when empty', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      businessName: ' ',
      firstName: '',
      lastName: ''
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.businessName).toBeTypeOf('string');
  });

  it('validates visible contact formats when provided without surfacing hidden style-field errors', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const invalid = validateConfiguracionForm({
      ...validBaseInput,
      supportEmail: 'invalid-email',
      phone: 'abc123',
      whatsapp: '+1 415 555 2671',
      instagram: 'not-an-instagram-handle',
      logoUrl: 'ftp://invalid-logo-url',
      coverUrl: 'invalid-url'
    });

    expect(invalid.isValid).toBe(false);
    expect(invalid.fieldErrors.supportEmail).toBeTypeOf('string');
    expect(invalid.fieldErrors.phone).toBeTypeOf('string');
    expect(invalid.fieldErrors.whatsapp).toBeTypeOf('string');
    expect(invalid.fieldErrors.instagram).toBeTypeOf('string');
    expect(invalid.fieldErrors.logoUrl).toBeUndefined();
    expect(invalid.fieldErrors.coverUrl).toBeUndefined();

    const valid = validateConfiguracionForm({
      ...validBaseInput,
      supportEmail: '',
      phone: '',
      whatsapp: '',
      instagram: '',
      logoUrl: '',
      coverUrl: ''
    });

    expect(valid.fieldErrors.supportEmail).toBeUndefined();
    expect(valid.fieldErrors.phone).toBeUndefined();
    expect(valid.fieldErrors.whatsapp).toBeUndefined();
    expect(valid.fieldErrors.instagram).toBeUndefined();
    expect(valid.fieldErrors.logoUrl).toBeUndefined();
    expect(valid.fieldErrors.coverUrl).toBeUndefined();
  });

  it('does not block settings validation for hidden Orvel-owned logo and cover URLs', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      logoUrl: 'not-a-visible-user-editable-url',
      coverUrl: 'ftp://legacy-internal-cover'
    });

    expect(result.isValid).toBe(true);
    expect(result.fieldErrors.logoUrl).toBeUndefined();
    expect(result.fieldErrors.coverUrl).toBeUndefined();
  });

  it('accepts the same common Argentina phone variants as public booking for phone and whatsapp', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();
    const validArgentinaPhones = [
      '+5491112345678',
      '+54 11 5555-0000',
      '11 1234-5678',
      '011 15 1234 5678',
      '351 123 4567',
      '+54 351 123 4567'
    ];

    for (const phone of validArgentinaPhones) {
      const result = validateConfiguracionForm({
        ...validBaseInput,
        phone,
        whatsapp: phone
      });

      expect(result.fieldErrors.phone, `phone should accept ${phone}`).toBeUndefined();
      expect(result.fieldErrors.whatsapp, `whatsapp should accept ${phone}`).toBeUndefined();
      expect(result.isValid, `settings form should be valid for ${phone}`).toBe(true);
    }
  });

  it('rejects invalid, too-short, and non-Argentina phone and whatsapp samples explicitly', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();
    const invalidSamples = [
      { label: 'invalid characters', value: 'abc123' },
      { label: 'too short Argentina number', value: '+54 11 123' },
      { label: 'non-Argentina international number', value: '+1 415 555 2671' },
      { label: 'non-Argentina LATAM number', value: '+57 300 123 4567' }
    ];

    for (const sample of invalidSamples) {
      const result = validateConfiguracionForm({
        ...validBaseInput,
        phone: sample.value,
        whatsapp: sample.value
      });

      expect(result.isValid, `${sample.label} should be rejected`).toBe(false);
      expect(result.fieldErrors.phone, `phone should reject ${sample.value}`).toBeTypeOf('string');
      expect(result.fieldErrors.whatsapp, `whatsapp should reject ${sample.value}`).toBeTypeOf('string');
    }
  });

  it('enforces range and length rules', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const tooLongName = 'x'.repeat(81);
    const result = validateConfiguracionForm({
      ...validBaseInput,
      businessName: tooLongName,
      bufferMinutes: -1,
      minNoticeMinutes: -2,
      slotIntervalMinutes: -3,
      cancelationGracePeriod: -4,
      maxAdvanceDays: 0,
      cleanupTimeMinutes: -6
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.businessName).toBeTypeOf('string');
    expect(result.fieldErrors.bufferMinutes).toBeTypeOf('string');
    expect(result.fieldErrors.minNoticeMinutes).toBeTypeOf('string');
    expect(result.fieldErrors.slotIntervalMinutes).toBeTypeOf('string');
    expect(result.fieldErrors.cancelationGracePeriod).toBeTypeOf('string');
    expect(result.fieldErrors.maxAdvanceDays).toBeTypeOf('string');
    expect(result.fieldErrors.cleanupTimeMinutes).toBeTypeOf('string');
  });

  it('rejects enabled working days with opening time not before closing time', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      workingHours: {
        ...validWorkingHours,
        monday: { enabled: true, start: '18:00', end: '09:00' }
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.workingHours).toBe('El horario de apertura debe ser anterior al cierre');
  });

  it('accepts two non-overlapping ordered intervals on an enabled day', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      workingHours: {
        ...validWorkingHours,
        tuesday: { enabled: true, start: '09:00', end: '13:30', start2: '16:00', end2: '20:00' }
      }
    });

    expect(result.isValid).toBe(true);
    expect(result.fieldErrors.workingHours).toBeUndefined();
  });

  it('rejects overlapping intervals on an enabled day', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      workingHours: {
        ...validWorkingHours,
        tuesday: { enabled: true, start: '09:00', end: '16:00', start2: '15:00', end2: '20:00' }
      }
    });

    expect(result.isValid).toBe(false);
    expect(result.fieldErrors.workingHours).toBeTypeOf('string');
  });

  it('still accepts a single start/end window without a second interval', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm(validBaseInput);

    expect(result.isValid).toBe(true);
    expect(result.fieldErrors.workingHours).toBeUndefined();
  });

  it('strips extra settings-form keys instead of rejecting the save', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      autoConfirm: true,
      plan: 'zen',
      businessType: 'peluqueria',
      weekStartDay: 'monday',
      timeFormat: '12h',
      workingHours: {
        ...validWorkingHours,
        tuesday: { enabled: true, start: '09:00', end: '13:30', start2: '16:00', end2: '20:00' }
      }
    });

    expect(result.isValid).toBe(true);
  });

  it('does not surface Zod Invalid input when hydrated settings send nulls', async () => {
    const { validateConfiguracionForm } = await loadConfiguracionValidationModule();

    const result = validateConfiguracionForm({
      ...validBaseInput,
      firstName: null,
      lastName: null,
      supportEmail: null,
      phone: null,
      whatsapp: null,
      instagram: null,
      logoUrl: null,
      coverUrl: null,
      capacity: null,
      cleanupTimeMinutes: null
    } as unknown as ConfiguracionValidationInput);

    expect(result.isValid).toBe(true);
    expect(Object.values(result.fieldErrors)).not.toContain('Invalid input');
  });
});
