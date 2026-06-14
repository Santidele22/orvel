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

  it('validates Argentina area code, local number, mobile prefix, and total national number length', async () => {
    const { validateSignupCredentials, mapSignupCredentialErrorsForAstro } = await loadValidationModule();

    const unknownAreaCode = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '9999' },
      { requirePassword: true }
    );
    const mobilePrefixInLocalNumber = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '11', telefonoNumero: '1523456789' },
      { requirePassword: true }
    );
    const invalidTotalLength = validateSignupCredentials(
      { ...VALID_FREE_CREDENTIALS, telefonoCaracteristica: '341', telefonoNumero: '12345678' },
      { requirePassword: true }
    );

    expect(mapSignupCredentialErrorsForAstro(unknownAreaCode)).toMatchObject({
      telefonoCaracteristica: 'Característica argentina no reconocida'
    });
    expect(mapSignupCredentialErrorsForAstro(mobilePrefixInLocalNumber)).toMatchObject({
      telefonoNumero: 'Ingresá el número local sin 15'
    });
    expect(mapSignupCredentialErrorsForAstro(invalidTotalLength)).toMatchObject({
      telefonoNumero: 'La característica y el número local deben sumar 10 dígitos'
    });
  });

  it('normalizes formatted Argentina phone input to +54 plus area code and local number digits', async () => {
    const { validateSignupCredentials } = await loadValidationModule();

    const result = validateSignupCredentials(
      {
        ...VALID_FREE_CREDENTIALS,
        telefonoCaracteristica: '(341)',
        telefonoNumero: '555-1234'
      },
      { requirePassword: true }
    );

    expect(result.success).toBe(true);
    expect(result.data.normalizedPhone).toBe('+543415551234');
  });
});
