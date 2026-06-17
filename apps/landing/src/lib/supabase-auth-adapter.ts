import { createClient, type SupabaseClient } from '@supabase/supabase-js';
export type LoginAttempt = {
  email: string;
  password: string;
  returnTo?: string | null;
  selectedRubros?: string[];
  plan?: unknown;
};

export type SignupAttempt = {
  nombre: string;
  apellido: string;
  negocioNombre: string;
  tipoNegocio: string;
  telefono?: string;
  email?: string;
  password?: string;
  returnTo?: string | null;
  plan?: unknown;
};

export type SupabaseAdapterResult =
  | {
      ok: true;
      token: string;
    user: {
        id: string;
        email: string;
        nombre?: string;
        apellido?: string;
        negocioNombre?: string;
        tipoNegocio?: string;
      };
    }
  | {
      ok: false;
      code: 'invalid_credentials' | 'unavailable' | 'unknown' | 'onboarding_required' | 'signup_existing' | 'email_confirmation_required';
      error: string;
      redirectTo?: string;
    };

export type SupabaseAuthEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

export type SupabaseAuthDependencies = {
  createClient: (url: string, anonKey: string, options?: Parameters<typeof createClient>[2]) => SupabaseClient;
};

export const ORVEL_SUPABASE_AUTH_STORAGE_KEY = 'orvel.supabase.auth';
const MISSING_SUPABASE_CONFIG_ERROR =
  'Autenticación no configurada: faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY.';

function hasBrowserStorageApi(value: unknown): value is Storage {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Storage).getItem === 'function' &&
    typeof (value as Storage).setItem === 'function' &&
    typeof (value as Storage).removeItem === 'function'
  );
}

export function createSupabaseBrowserAuthOptions(storage?: Storage): Parameters<typeof createClient>[2] {
  const resolvedStorage = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);

  return {
    auth: {
      flowType: 'pkce',
      persistSession: true,
      detectSessionInUrl: false,
      storageKey: ORVEL_SUPABASE_AUTH_STORAGE_KEY,
      ...(hasBrowserStorageApi(resolvedStorage) ? { storage: resolvedStorage } : {})
    }
  };
}

function parseSelectedRubros(rawValue: unknown): string[] | undefined {
  if (!Array.isArray(rawValue)) {
    return undefined;
  }

  const values = rawValue
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value, index, all) => all.indexOf(value) === index);

  return values.length > 0 ? values : undefined;
}

function resolveSupabaseConfig(env: SupabaseAuthEnv): { url: string; anonKey: string } | null {
  const url = env.SUPABASE_URL?.trim();
  const anonKey = env.SUPABASE_ANON_KEY?.trim();

  if (!url || !anonKey) {
    return null;
  }

  return {
    url,
    anonKey
  };
}

function isInvalidCredentialsError(message: string): boolean {
  return /invalid\s+login\s+credentials|invalid_credentials|credenciales/i.test(message);
}

const CANONICAL_PLAN_CODES = ['FREE', 'STARTED', 'GROWTH', 'PRO'] as const;
const ALLOWED_ONBOARDING_BUSINESS_TYPES = ['uñas', 'peluqueria', 'barberia', 'spa', 'pestañas', 'cejas', 'masajes', 'otro', 'pendiente'] as const;

const PLAN_ALIASES: Record<string, (typeof CANONICAL_PLAN_CODES)[number]> = {
  BASIC: 'STARTED',
  STARTER: 'STARTED',
  MEDIUM: 'GROWTH'
};

function normalizeSignupPlan(plan: unknown): (typeof CANONICAL_PLAN_CODES)[number] | null {
  if (typeof plan !== 'string' || plan.trim().length === 0) {
    return null;
  }

  const normalized = plan.trim().toUpperCase();
  const canonical = PLAN_ALIASES[normalized] ?? normalized;
  return (CANONICAL_PLAN_CODES as readonly string[]).includes(canonical)
    ? (canonical as (typeof CANONICAL_PLAN_CODES)[number])
    : null;
}

function isFreeSignupPlan(plan: (typeof CANONICAL_PLAN_CODES)[number]): boolean {
  return plan === 'FREE';
}

function isDuplicateSignupErrorMessage(message: string): boolean {
  return /user\s+already\s+registered|already\s+registered|email\s+already\s+registered|already\s+exists/i.test(message);
}

function buildRecoverableSignupExistingResult(): Extract<SupabaseAdapterResult, { ok: false }> {
  return {
    ok: false,
    code: 'signup_existing',
    error: 'Ya existe una cuenta con ese email. Iniciá sesión para continuar y retomar el onboarding.'
  };
}

function normalizeBusinessType(tipoNegocio: unknown): (typeof ALLOWED_ONBOARDING_BUSINESS_TYPES)[number] | null {
  if (typeof tipoNegocio !== 'string') {
    return null;
  }

  const normalizedType = tipoNegocio.trim().toLowerCase();
  if ((ALLOWED_ONBOARDING_BUSINESS_TYPES as readonly string[]).includes(normalizedType)) {
    return normalizedType as (typeof ALLOWED_ONBOARDING_BUSINESS_TYPES)[number];
  }

  return null;
}

export function createSupabaseLoginAdapter(
  env: SupabaseAuthEnv,
  dependencies: SupabaseAuthDependencies = {
    createClient
  }
): (attempt: LoginAttempt) => Promise<SupabaseAdapterResult> {
  const config = resolveSupabaseConfig(env);

  if (!config) {
    return async () => ({
      ok: false,
      code: 'unavailable',
      error: MISSING_SUPABASE_CONFIG_ERROR
    });
  }

  const client = dependencies.createClient(config.url, config.anonKey, createSupabaseBrowserAuthOptions());

  return async (attempt: LoginAttempt): Promise<SupabaseAdapterResult> => {
    try {
      const { data, error } = await client.auth.signInWithPassword({
        email: attempt.email,
        password: attempt.password
      });

      if (error) {
        let message = error.message ?? 'No se pudo iniciar sesión en Supabase.';
        
        if (message.includes('rate limit')) {
          message = 'Se superó el límite de intentos o envío de correos. Por favor, intentá nuevamente más tarde.';
        }

        return {
          ok: false,
          code: isInvalidCredentialsError(message) ? 'invalid_credentials' : 'unknown',
          error: message
        };
      }

      const session = data.session;
      const user = data.user;

      if (!session?.access_token || !user?.id || !user.email) {
        return {
          ok: false,
          code: 'unknown',
          error: 'Supabase devolvió una sesión incompleta.'
        };
      }

      const selectedBusinessTypes = parseSelectedRubros(user.user_metadata?.selectedBusinessTypes);
      const selectedRubros =
        parseSelectedRubros(user.user_metadata?.selectedRubros) ?? selectedBusinessTypes;

      return {
        ok: true,
        token: session.access_token,
        user: {
          id: user.id,
          email: user.email,
          nombre: user.user_metadata?.nombre,
          apellido: user.user_metadata?.apellido,
          negocioNombre: user.user_metadata?.negocioNombre,
          tipoNegocio: user.user_metadata?.tipoNegocio
        }
      };
    } catch {
      return {
        ok: false,
        code: 'unavailable',
        error: 'Supabase no está disponible en este momento.'
      };
    }
  };
}

export function createSupabaseSignupAdapter(
  env: SupabaseAuthEnv,
  dependencies: SupabaseAuthDependencies = {
    createClient
  }
): (attempt: SignupAttempt) => Promise<SupabaseAdapterResult> {
  const config = resolveSupabaseConfig(env);

  if (!config) {
    return async () => ({
      ok: false,
      code: 'unavailable',
      error: MISSING_SUPABASE_CONFIG_ERROR
    });
  }

  const client = dependencies.createClient(config.url, config.anonKey, createSupabaseBrowserAuthOptions());

  return async (attempt: SignupAttempt): Promise<SupabaseAdapterResult> => {
    try {
      const planCode = normalizeSignupPlan(attempt.plan);
      if (!planCode) {
        return {
          ok: false,
          code: 'onboarding_required',
          error: 'El onboarding requiere seleccionar un plan válido antes de crear la cuenta.'
        };
      }

      const businessType = normalizeBusinessType(attempt.tipoNegocio);
      if (!businessType) {
        return {
          ok: false,
          code: 'onboarding_required',
          error: 'El onboarding requiere seleccionar un tipo de negocio válido antes de crear la cuenta.'
        };
      }

      const onboardingCompleted = !isFreeSignupPlan(planCode);

      const { data, error } = await client.auth.signUp({
        email: attempt.email ?? '',
        password: attempt.password ?? '',
        options: {
          data: {
            nombre: attempt.nombre,
            apellido: attempt.apellido,
            negocioNombre: attempt.negocioNombre,
            tipoNegocio: businessType,
            telefono: attempt.telefono,
            plan: planCode,
            onboardingCompleted,
            onboarding_completed: onboardingCompleted
          }
        }
      });

      if (error) {
        let message = error.message ?? 'No se pudo crear la cuenta en Supabase.';
        
        if (message.includes('rate limit')) {
          message = 'Se superó el límite de intentos o envío de correos. Por favor, intentá nuevamente más tarde.';
        }

        if (isDuplicateSignupErrorMessage(message)) {
          return buildRecoverableSignupExistingResult();
        }

        return {
          ok: false,
          code: 'unknown',
          error: message
        };
      }

      const session = data.session;
      const user = data.user;

      if (!session?.access_token) {
        // If user already exists, Supabase returns user but no session and empty identities
        if (user && user.identities && user.identities.length === 0) {
          return buildRecoverableSignupExistingResult();
        }
        // If email confirmation is enabled, Supabase creates the Auth user but returns no session.
        return {
          ok: false,
          code: 'email_confirmation_required',
          error: 'Registro exitoso. Revisá tu email para confirmar la cuenta antes de continuar.'
        };
      }

      if (!user?.id || !user.email) {
        return {
          ok: false,
          code: 'unknown',
          error: 'Supabase devolvió una sesión incompleta al registrar.'
        };
      }

      return {
        ok: true,
        token: session.access_token,
        user: {
          id: user.id,
          email: user.email,
          nombre: attempt.nombre,
          apellido: attempt.apellido,
          negocioNombre: attempt.negocioNombre,
          tipoNegocio: businessType
        }
      };
    } catch {
      return {
        ok: false,
        code: 'unavailable',
        error: 'Supabase no está disponible en este momento.'
      };
    }
  };
}
