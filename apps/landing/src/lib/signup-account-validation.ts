import { z } from 'zod';
import { ARGENTINA_AREA_CODES } from './argentina-area-codes';

export const SIGNUP_ACCOUNT_FIELDS = [
  'nombre',
  'apellido',
  'negocioNombre',
  'rubro',
  'telefonoCaracteristica',
  'telefonoNumero',
  'email',
  'password',
  'confirm'
] as const;

export type SignupAccountField = typeof SIGNUP_ACCOUNT_FIELDS[number];

export type SignupAccountInput = Partial<Record<SignupAccountField, unknown>>;

export type SignupAccountValidationOptions = {
  requirePassword: boolean;
};

export type ValidSignupAccount = {
  nombre: string;
  apellido: string;
  negocioNombre: string;
  rubro: string;
  telefonoCaracteristica: string;
  telefonoNumero: string;
  email: string;
  password: string;
  confirm: string;
  normalizedPhone: string;
};

export type SignupAccountErrorMap = Partial<Record<SignupAccountField, string>>;

export type SignupAccountValidationResult =
  | { success: true; data: ValidSignupAccount }
  | { success: false; fieldErrors: SignupAccountErrorMap };

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

const accountString = z.preprocess(
  (value) => (typeof value === 'string' ? value : ''),
  z.string()
);

const baseSignupAccountSchema = z.object({
  nombre: accountString,
  apellido: accountString,
  negocioNombre: accountString,
  rubro: accountString,
  telefonoCaracteristica: accountString,
  telefonoNumero: accountString,
  email: accountString,
  password: accountString,
  confirm: accountString
});

const addFieldError = (
  ctx: z.RefinementCtx,
  field: SignupAccountField,
  message: string
) => {
  ctx.addIssue({
    code: 'custom',
    path: [field],
    message
  });
};

const buildSignupAccountSchema = ({ requirePassword }: SignupAccountValidationOptions) =>
  baseSignupAccountSchema.transform((values) => ({
    nombre: values.nombre.trim(),
    apellido: values.apellido.trim(),
    negocioNombre: values.negocioNombre.trim(),
    rubro: values.rubro.trim(),
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

    if (!values.rubro) addFieldError(ctx, 'rubro', 'Seleccioná el rubro o categoría del negocio');

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
  }).transform((values): ValidSignupAccount => ({
    ...values,
    normalizedPhone: normalizeArgentinaPhone(values.telefonoCaracteristica, values.telefonoNumero)
  }));

export function validateSignupAccount(
  input: SignupAccountInput,
  options: SignupAccountValidationOptions
): SignupAccountValidationResult {
  const result = buildSignupAccountSchema(options).safeParse(input);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const fieldErrors: SignupAccountErrorMap = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && SIGNUP_ACCOUNT_FIELDS.includes(field as SignupAccountField)) {
      const accountField = field as SignupAccountField;
      fieldErrors[accountField] ??= issue.message;
    }
  }

  return { success: false, fieldErrors };
}

export function mapSignupAccountErrorsForAstro(
  result: SignupAccountValidationResult
): SignupAccountErrorMap {
  return result.success ? {} : result.fieldErrors;
}

export const SIGNUP_CREDENTIAL_FIELDS = SIGNUP_ACCOUNT_FIELDS;
export type SignupCredentialField = SignupAccountField;
export type SignupCredentialsInput = SignupAccountInput;
export type SignupCredentialsValidationOptions = SignupAccountValidationOptions;
export type ValidSignupCredentials = ValidSignupAccount;
export type SignupCredentialErrorMap = SignupAccountErrorMap;
export type SignupCredentialsValidationResult = SignupAccountValidationResult;
export const validateSignupCredentials = validateSignupAccount;
export const mapSignupCredentialErrorsForAstro = mapSignupAccountErrorsForAstro;
