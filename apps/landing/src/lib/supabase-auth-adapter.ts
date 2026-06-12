import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  buildGoogleOAuthSignupRequest,
  createBrowserOAuthSignupIntentStore,
  normalizeOAuthSignupPlan,
  type OAuthSignupIntentStore
} from './oauth-signup-onboarding-flow';

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
      code: 'invalid_credentials' | 'unavailable' | 'unknown' | 'onboarding_required';
      error: string;
    };

export type SupabaseOAuthAdapterResult =
  | {
      ok: true;
      redirectTo?: string;
    }
  | {
      ok: false;
      code?: 'unavailable' | 'unknown';
      error: string;
      oauthDiagnostics?: SupabaseOAuthRedirectDiagnostics;
    };

export type SupabaseOAuthRedirectDiagnostics = {
  urlOrigin: string | null;
  urlPathname: string | null;
  redirectTo: string | null;
  redirectToOrigin: string | null;
  redirectToPathname: string | null;
};

export type SupabaseAuthEnv = {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
};

export type SupabaseAuthDependencies = {
  createClient: (url: string, anonKey: string, options?: Parameters<typeof createClient>[2]) => SupabaseClient;
  oauthSignupIntentStore?: OAuthSignupIntentStore;
};

export const ORVEL_SUPABASE_AUTH_STORAGE_KEY = 'orvel.supabase.auth';
const MISSING_SUPABASE_CONFIG_ERROR =
  'Autenticación no configurada: faltan PUBLIC_SUPABASE_URL o PUBLIC_SUPABASE_ANON_KEY.';

type OAuthExchangeDiagnostics = {
  name: string;
  code: string;
  status: number | null;
};

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

export function getOAuthExchangeDiagnostics(error: unknown): OAuthExchangeDiagnostics {
  const errorRecord = typeof error === 'object' && error !== null ? (error as Record<string, unknown>) : {};
  const name =
    typeof errorRecord.name === 'string' && errorRecord.name.trim()
      ? errorRecord.name
      : error instanceof Error
        ? error.name
        : 'OAuthExchangeError';
  const code =
    typeof errorRecord.code === 'string' && errorRecord.code.trim()
      ? errorRecord.code
      : typeof errorRecord.error === 'string' && errorRecord.error.trim()
        ? errorRecord.error
        : 'oauth_exchange_failed';
  const statusCandidate = errorRecord.status;
  const status = typeof statusCandidate === 'number' && Number.isFinite(statusCandidate) ? statusCandidate : null;

  return { name, code, status };
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

const CANONICAL_PLAN_CODES = ['STARTED', 'GROWTH', 'PRO'] as const;
const ALLOWED_ONBOARDING_BUSINESS_TYPES = ['uñas', 'peluqueria', 'barberia', 'spa', 'pestañas', 'cejas', 'masajes', 'otro', 'pendiente'] as const;

function normalizeSignupPlan(plan: unknown): (typeof CANONICAL_PLAN_CODES)[number] | null {
  const normalizedPlan = typeof plan === 'string' && plan.trim().toUpperCase() === 'FREE'
    ? 'STARTED'
    : normalizeOAuthSignupPlan(plan);
  return (CANONICAL_PLAN_CODES as readonly string[]).includes(normalizedPlan ?? '')
    ? (normalizedPlan as (typeof CANONICAL_PLAN_CODES)[number])
    : null;
}

function normalizeOAuthStartPlan(plan: unknown): string | null {
  return normalizeOAuthSignupPlan(plan);
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

function resolveRedirectOrigin(redirectTo: string): string {
  try {
    return new URL(redirectTo).origin;
  } catch {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }

    return 'https://orvel.pro';
  }
}

function resolveOAuthRedirectTo(redirectTo: string): string {
  try {
    return new URL(redirectTo, resolveRedirectOrigin(redirectTo)).toString();
  } catch {
    return redirectTo;
  }
}

function isCanonicalLoginCallback(redirectTo: string): boolean {
  try {
    return new URL(redirectTo, resolveRedirectOrigin(redirectTo)).pathname === '/auth/callback';
  } catch {
    return false;
  }
}

function buildOAuthOnboardingRedirect(redirectTo: string): string {
  const origin = resolveRedirectOrigin(redirectTo);
  const onboardingUrl = new URL('/auth/onboarding', origin);
  onboardingUrl.searchParams.set('returnTo', redirectTo);
  return onboardingUrl.toString();
}

export function parseSupabaseOAuthRedirectDiagnostics(url: string | null | undefined): SupabaseOAuthRedirectDiagnostics {
  if (!url) {
    return { urlOrigin: null, urlPathname: null, redirectTo: null, redirectToOrigin: null, redirectToPathname: null };
  }

  try {
    const parsed = new URL(url);
    const redirectTo = parsed.searchParams.get('redirect_to');
    if (!redirectTo) {
      return {
        urlOrigin: parsed.origin,
        urlPathname: parsed.pathname,
        redirectTo: null,
        redirectToOrigin: null,
        redirectToPathname: null
      };
    }

    try {
      const parsedRedirectTo = new URL(redirectTo);
      return {
        urlOrigin: parsed.origin,
        urlPathname: parsed.pathname,
        redirectTo,
        redirectToOrigin: parsedRedirectTo.origin,
        redirectToPathname: parsedRedirectTo.pathname
      };
    } catch {
      return {
        urlOrigin: parsed.origin,
        urlPathname: parsed.pathname,
        redirectTo,
        redirectToOrigin: null,
        redirectToPathname: null
      };
    }
  } catch {
    return { urlOrigin: null, urlPathname: null, redirectTo: null, redirectToOrigin: null, redirectToPathname: null };
  }
}

function validateLocalProxyOAuthRedirect(requestedRedirectTo: string, returnedUrl: string): SupabaseOAuthAdapterResult | null {
  let requested: URL;
  try {
    requested = new URL(requestedRedirectTo);
  } catch {
    return null;
  }

  if (requested.origin !== 'http://localhost:3000' || requested.pathname !== '/auth/callback') {
    return null;
  }

  const diagnostics = parseSupabaseOAuthRedirectDiagnostics(returnedUrl);
  if (
    diagnostics.redirectToOrigin === requested.origin &&
    diagnostics.redirectToPathname === requested.pathname
  ) {
    return null;
  }

  if (!diagnostics.redirectToOrigin || !diagnostics.redirectToPathname) {
    return null;
  }

  return {
    ok: false,
    code: 'unknown',
    error: `Supabase OAuth devolvió redirect_to=${diagnostics.redirectToOrigin}${diagnostics.redirectToPathname} pero el proxy local necesita ${requested.origin}${requested.pathname}. Agregá http://localhost:3000/auth/callback a Supabase Auth URL allowlist y usá el proxy como Site URL local.`,
    oauthDiagnostics: diagnostics
  };
}

function getBrowserSignupIntentStore(dependencies: SupabaseAuthDependencies): OAuthSignupIntentStore | null {
  if (dependencies.oauthSignupIntentStore) {
    return dependencies.oauthSignupIntentStore;
  }

  if (typeof sessionStorage === 'undefined') {
    return null;
  }

  return createBrowserOAuthSignupIntentStore(sessionStorage);
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
            onboardingCompleted: true,
            onboarding_completed: true
          }
        }
      });

      if (error) {
        let message = error.message ?? 'No se pudo crear la cuenta en Supabase.';
        
        if (message.includes('rate limit')) {
          message = 'Se superó el límite de intentos o envío de correos. Por favor, intentá nuevamente más tarde.';
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
          return {
            ok: false,
            code: 'unknown',
            error: 'El email ya se encuentra registrado. Por favor, iniciá sesión.'
          };
        }
        // If email confirmation is enabled, session is null
        return {
          ok: false,
          code: 'unknown',
          error: 'Registro exitoso. Por favor, revisá tu email para confirmar la cuenta.'
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

export function createSupabaseOAuthAdapter(
  env: SupabaseAuthEnv,
  dependencies: SupabaseAuthDependencies = {
    createClient
  }
) {
  const config = resolveSupabaseConfig(env);

  if (!config) {
    return async () => ({
      ok: false,
      code: 'unavailable',
      error: MISSING_SUPABASE_CONFIG_ERROR
    });
  }

  const client = dependencies.createClient(config.url, config.anonKey, createSupabaseBrowserAuthOptions());

  return async (
    provider: 'google',
    input: string | { redirectTo: string; plan?: unknown; tipoNegocio?: unknown }
  ): Promise<SupabaseOAuthAdapterResult> => {
    try {
      const redirectTo = resolveOAuthRedirectTo(typeof input === 'string' ? input : input.redirectTo);
      const isLoginCallback = isCanonicalLoginCallback(redirectTo);
      const hasCompleteOnboarding =
        typeof input !== 'string' &&
        normalizeSignupPlan(input.plan) !== null &&
        normalizeBusinessType(input.tipoNegocio) !== null;
      const selectedPlan = typeof input !== 'string' ? normalizeOAuthStartPlan(input.plan) : null;
      const signupIntentStore = selectedPlan && !hasCompleteOnboarding ? getBrowserSignupIntentStore(dependencies) : null;

      const oauthOptions = signupIntentStore
        ? (
            await buildGoogleOAuthSignupRequest({
              origin: resolveRedirectOrigin(redirectTo),
              selectedPlan,
              intentStore: signupIntentStore
            })
          ).options
        : {
            redirectTo: !hasCompleteOnboarding && !isLoginCallback ? buildOAuthOnboardingRedirect(redirectTo) : redirectTo,
            queryParams: hasCompleteOnboarding || isLoginCallback
              ? undefined
              : {
                  onboarding_required: 'true'
                }
          };

      const { data, error } = await client.auth.signInWithOAuth({
        provider,
        options: oauthOptions
      });

      if (error) {
        return { ok: false, error: error.message };
      }

      if (typeof data?.url === 'string' && data.url.trim()) {
        const localProxyGuard = validateLocalProxyOAuthRedirect(redirectTo, data.url);
        if (localProxyGuard) return localProxyGuard;
        return { ok: true, redirectTo: data.url };
      }

      return { ok: true };
    } catch {
      return { ok: false, code: 'unavailable', error: 'OAuth no disponible' };
    }
  };
}
