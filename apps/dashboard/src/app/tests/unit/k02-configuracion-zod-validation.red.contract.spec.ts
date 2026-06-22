import { describe, expect, it } from 'vitest';

type ConfiguracionWorkingDay = {
  enabled: boolean;
  start: string;
  end: string;
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

  it('validates email/phone/url formats when provided', async () => {
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
    expect(invalid.fieldErrors.logoUrl).toBeTypeOf('string');
    expect(invalid.fieldErrors.coverUrl).toBeTypeOf('string');

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
});
