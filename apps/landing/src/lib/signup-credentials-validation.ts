import { z } from 'zod';
import { ARGENTINA_AREA_CODES } from './argentina-area-codes';

export const SIGNUP_CREDENTIAL_FIELDS = [
  'nombre',
  'apellido',
  'negocioNombre',
  'telefonoCaracteristica',
  'telefonoNumero',
  'email',
  'password',
  'confirm'
] as const;

export type SignupCredentialField = typeof SIGNUP_CREDENTIAL_FIELDS[number];

export type SignupCredentialsInput = Partial<Record<SignupCredentialField, unknown>>;

export type SignupCredentialsValidationOptions = {
  requirePassword: boolean;
};

export type ValidSignupCredentials = {
  nombre: string;
  apellido: string;
  negocioNombre: string;
  telefonoCaracteristica: string;
  telefonoNumero: string;
  email: string;
  password: string;
  confirm: string;
  normalizedPhone: string;
};

export type SignupCredentialErrorMap = Partial<Record<SignupCredentialField, string>>;

export type SignupCredentialsValidationResult =
  | { success: true; data: ValidSignupCredentials }
  | { success: false; fieldErrors: SignupCredentialErrorMap };

const argentinaAreaCodes = new Set<string>(ARGENTINA_AREA_CODES);

const hasOnlyDigits = (value: string): boolean => /^\d+$/.test(value);

const getLocalNumberLengthError = (areaCode: string, localNumber: string): string | undefined => {
  if (areaCode === '294' && !/^\d{6,7}$/.test(localNumber)) {
    return 'El número local debe tener 6 o 7 dígitos';
  }

  if (!/^\d{6,8}$/.test(localNumber)) {
    return 'El número local debe tener entre 6 y 8 dígitos';
  }

  return undefined;
};

export const normalizeArgentinaPhone = (telefonoCaracteristica: string, telefonoNumero: string): string => {
  const areaCode = telefonoCaracteristica.trim();
  const localNumber = telefonoNumero.trim();
  return `+54${areaCode}${localNumber}`;
};

const credentialString = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z.string()
);

const baseSignupCredentialsSchema = z.object({
  nombre: credentialString,
  apellido: credentialString,
  negocioNombre: credentialString,
  telefonoCaracteristica: credentialString,
  telefonoNumero: credentialString,
  email: credentialString,
  password: credentialString,
  confirm: credentialString
});

const addFieldError = (
  ctx: z.RefinementCtx,
  field: SignupCredentialField,
  message: string
) => {
  ctx.addIssue({
    code: 'custom',
    path: [field],
    message
  });
};

const buildSignupCredentialsSchema = ({ requirePassword }: SignupCredentialsValidationOptions) =>
  baseSignupCredentialsSchema.transform((values) => ({
    nombre: values.nombre.trim(),
    apellido: values.apellido.trim(),
    negocioNombre: values.negocioNombre.trim(),
    telefonoCaracteristica: values.telefonoCaracteristica.trim(),
    telefonoNumero: values.telefonoNumero.trim(),
    email: values.email.trim(),
    password: values.password,
    confirm: values.confirm
  })).superRefine((values, ctx) => {
    if (!values.nombre) addFieldError(ctx, 'nombre', 'El nombre es requerido');
    else if (values.nombre.length < 2) addFieldError(ctx, 'nombre', 'El nombre debe tener al menos 2 caracteres');

    if (!values.apellido) addFieldError(ctx, 'apellido', 'El apellido es requerido');
    else if (values.apellido.length < 2) addFieldError(ctx, 'apellido', 'El apellido debe tener al menos 2 caracteres');

    if (!values.negocioNombre) addFieldError(ctx, 'negocioNombre', 'El nombre del negocio es requerido');
    else if (values.negocioNombre.length < 3) addFieldError(ctx, 'negocioNombre', 'Debe tener al menos 3 caracteres');

    if (!values.telefonoCaracteristica) {
      addFieldError(ctx, 'telefonoCaracteristica', 'La característica o código de área es requerida');
    } else if (!hasOnlyDigits(values.telefonoCaracteristica)) {
      addFieldError(ctx, 'telefonoCaracteristica', 'La característica debe contener solo dígitos');
    } else if (!/^\d{2,4}$/.test(values.telefonoCaracteristica)) {
      addFieldError(ctx, 'telefonoCaracteristica', 'La característica debe tener entre 2 y 4 dígitos');
    } else if (!argentinaAreaCodes.has(values.telefonoCaracteristica)) {
      addFieldError(ctx, 'telefonoCaracteristica', 'Característica argentina no reconocida');
    }

    if (!values.telefonoNumero) {
      addFieldError(ctx, 'telefonoNumero', 'El número local es requerido');
    } else if (!hasOnlyDigits(values.telefonoNumero)) {
      addFieldError(ctx, 'telefonoNumero', 'El número local debe contener solo dígitos');
    } else if (values.telefonoNumero.startsWith('15')) {
      addFieldError(ctx, 'telefonoNumero', 'Ingresá el número local sin 15');
    } else {
      const lengthError = getLocalNumberLengthError(values.telefonoCaracteristica, values.telefonoNumero);
      if (lengthError) addFieldError(ctx, 'telefonoNumero', lengthError);
    }

    if (!values.email) addFieldError(ctx, 'email', 'El email es requerido');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)) addFieldError(ctx, 'email', 'Ingresá un email válido');

    if (requirePassword) {
      if (!values.password) addFieldError(ctx, 'password', 'La contraseña es requerida');
      else if (values.password.length < 8) addFieldError(ctx, 'password', 'Mínimo 8 caracteres');

      if (!values.confirm) addFieldError(ctx, 'confirm', 'Confirmá tu contraseña');
      else if (values.confirm !== values.password) addFieldError(ctx, 'confirm', 'Las contraseñas no coinciden');
    }
  }).transform((values): ValidSignupCredentials => ({
    ...values,
    normalizedPhone: normalizeArgentinaPhone(values.telefonoCaracteristica, values.telefonoNumero)
  }));

export function validateSignupCredentials(
  input: SignupCredentialsInput,
  options: SignupCredentialsValidationOptions
): SignupCredentialsValidationResult {
  const result = buildSignupCredentialsSchema(options).safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: SignupCredentialErrorMap = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && SIGNUP_CREDENTIAL_FIELDS.includes(field as SignupCredentialField)) {
      const credentialField = field as SignupCredentialField;
      fieldErrors[credentialField] ??= issue.message;
    }
  }

  return { success: false, fieldErrors };
}

export function mapSignupCredentialErrorsForAstro(
  result: SignupCredentialsValidationResult
): SignupCredentialErrorMap {
  return result.success ? {} : result.fieldErrors;
}
