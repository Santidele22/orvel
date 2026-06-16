import { describe, expect, it } from 'vitest';

type SignupCredentialsValidationModule = typeof import('../lib/signup-credentials-validation');

const VALID_FREE_CREDENTIALS = {
  nombre: 'Ana',
  apellido: 'García',
  negocioNombre: 'Ana Beauty Studio',
  telefonoCaracteristica: '11',
  telefonoNumero: '23456789',
  email: 'ana@example.com',
  password: 'password-segura-123',
  confirm: 'password-segura-123'
};

async function loadValidationModule(): Promise<SignupCredentialsValidationModule> {
  return import('../lib/signup-credentials-validation');
}

describe('RED contract: framework-agnostic Zod signup credentials validation', () => {
  it('exports a non-DOM validation module that validates the complete free-signup credentials payload', async () => {
    const { validateSignupCredentials } = await loadValidationModule();

    const result = validateSignupCredentials(VALID_FREE_CREDENTIALS, { requirePassword: true });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      nombre: 'Ana',
      apellido: 'García',
      negocioNombre: 'Ana Beauty Studio',
      email: 'ana@example.com',
      normalizedPhone: '+541123456789'
    });
  });

  it('returns field-level required errors for every credentials field the Astro page renders', async () => {
    const { validateSignupCredentials, mapSignupCredentialErrorsForAstro } = await loadValidationModule();

    const result = validateSignupCredentials(
      {
        nombre: '',
        apellido: '',
        negocioNombre: '',
        telefonoCaracteristica: '',
        telefonoNumero: '',
        email: '',
        password: '',
        confirm: ''
      },
      { requirePassword: true }
    );

    expect(result.success).toBe(false);
    expect(mapSignupCredentialErrorsForAstro(result)).toEqual({
      nombre: 'El nombre es requerido',
      apellido: 'El apellido es requerido',
      negocioNombre: 'El nombre del negocio es requerido',
      telefonoCaracteristica: 'La característica o código de área es requerida',
      telefonoNumero: 'El número local es requerido',
      email: 'El email es requerido',
      password: 'La contraseña es requerida',
      confirm: 'Confirmá tu contraseña'
    });
  });

  it('enforces password confirmation only when password credentials are required', async () => {
    const { validateSignupCredentials, mapSignupCredentialErrorsForAstro } = await loadValidationModule();

    const invalidFreeResult = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, confirm: 'otra-password' },
      { requirePassword: true }
    );
    const paidResult = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, password: '', confirm: '' },
      { requirePassword: false }
    );

    expect(invalidFreeResult.success).toBe(false);
    expect(mapSignupCredentialErrorsForAstro(invalidFreeResult)).toMatchObject({
      confirm: 'Las contraseñas no coinciden'
    });
    expect(paidResult.success).toBe(true);
  });

  it('validates Argentina area code, local number, mobile prefix, and local-number boundaries', async () => {
    const { validateSignupCredentials, mapSignupCredentialErrorsForAstro } = await loadValidationModule();

    const unknownAreaCode = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '9999' },
      { requirePassword: true }
    );
    const mobilePrefixInLocalNumber = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '11', telefonoNumero: '1523456789' },
      { requirePassword: true }
    );
    const tooShortLocalNumber = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '294', telefonoNumero: '66716' },
      { requirePassword: true }
    );
    const tooLongLocalNumber = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '294', telefonoNumero: '46671612' },
      { requirePassword: true }
    );
    const nonNumericLocalNumber = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '294', telefonoNumero: '66A7161' },
      { requirePassword: true }
    );
    const symbolicAreaCode = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '(294)' },
      { requirePassword: true }
    );

    expect(mapSignupCredentialErrorsForAstro(unknownAreaCode)).toMatchObject({
      telefonoCaracteristica: 'Característica argentina no reconocida'
    });
    expect(mapSignupCredentialErrorsForAstro(mobilePrefixInLocalNumber)).toMatchObject({
      telefonoNumero: 'Ingresá el número local sin 15'
    });
    expect(mapSignupCredentialErrorsForAstro(tooShortLocalNumber)).toMatchObject({
      telefonoNumero: 'El número local debe tener 6 o 7 dígitos'
    });
    expect(mapSignupCredentialErrorsForAstro(tooLongLocalNumber)).toMatchObject({
      telefonoNumero: 'El número local debe tener 6 o 7 dígitos'
    });
    expect(mapSignupCredentialErrorsForAstro(nonNumericLocalNumber)).toMatchObject({
      telefonoNumero: 'El número local debe contener solo dígitos'
    });
    expect(mapSignupCredentialErrorsForAstro(symbolicAreaCode)).toMatchObject({
      telefonoCaracteristica: 'La característica debe contener solo dígitos'
    });
  });

  it('accepts realistic Argentina area code 294 local numbers with 6 or 7 digits without inventing or removing digits', async () => {
    const { validateSignupCredentials } = await loadValidationModule();

    const sixDigitLocalNumber = validateSignupCredentials(
      {
        ...VALID_FREE_CREDENTIALS,
        telefonoCaracteristica: '294',
        telefonoNumero: '667161'
      },
      { requirePassword: true }
    );
    const sevenDigitLocalNumber = validateSignupCredentials(
      {
        ...VALID_FREE_CREDENTIALS,
        telefonoCaracteristica: '294',
        telefonoNumero: '4667161'
      },
      { requirePassword: true }
    );

    expect(sixDigitLocalNumber.success).toBe(true);
    expect(sevenDigitLocalNumber.success).toBe(true);

    if (sixDigitLocalNumber.success) {
      expect(sixDigitLocalNumber.data.normalizedPhone).toBe('+54294667161');
    }
    if (sevenDigitLocalNumber.success) {
      expect(sevenDigitLocalNumber.data.normalizedPhone).toBe('+542944667161');
    }
  });

  it('normalizes raw Argentina phone digits to +54 plus area code and local number without inventing or removing digits', async () => {
    const { validateSignupCredentials } = await loadValidationModule();

    const result = validateSignupCredentials(
      {
        ...VALID_FREE_CREDENTIALS,
        telefonoCaracteristica: '341',
        telefonoNumero: '5551234'
      },
      { requirePassword: true }
    );

    expect(result.success).toBe(true);
    expect(result.data.normalizedPhone).toBe('+543415551234');
  });
});
