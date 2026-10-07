import {
  createSupabaseLoginAdapter,
  type LoginAttempt,
  type SupabaseAdapterResult,
  type SupabaseAuthDependencies,
  type SupabaseAuthEnv,
  createSupabaseSignupAdapter,
  type SignupAttempt
} from './supabase-auth-adapter';
import { sanitizeLandingAuthReturnTo } from './auth-return-to';
import { createDashboardSessionHandoff, type HandoffInvoke } from './dashboard-session-handoff';
import { markAuthPresent } from './auth-presence';

const AUTH_PROVIDER_UNAVAILABLE_MESSAGE =
  'No pudimos completar la autenticación en este momento. Intentá nuevamente en unos minutos o contactá al equipo de Orvel si el problema continúa.';

export interface LoginResult {
  ok: boolean;
  redirectTo?: string;
  error?: string;
}

type LoginWithProviderInput = {
  attempt: LoginAttempt;
  supabaseLogin: (attempt: LoginAttempt) => SupabaseAdapterResult | Promise<SupabaseAdapterResult>;
  dashboardHandoff?: {
    dashboardOrigin: string;
    invoke: HandoffInvoke;
  };
};

type RawRuntimeModeInput =
  | string
  | null
  | undefined
  | {
      authProviderMode?: unknown;
      mode?: unknown;
      PUBLIC_AUTH_PROVIDER_MODE?: unknown;
    };

function sanitizeReturnTo(returnTo: string | null | undefined): string {
  const currentOrigin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'http://localhost:4321';

  return sanitizeLandingAuthReturnTo(returnTo, {
    currentOrigin,
    dashboardBaseUrl: import.meta.env.PUBLIC_DASHBOARD_URL
  });
}

function sanitizeSelectedRubros(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0)
    .filter((value, index, all) => all.indexOf(value) === index);
}

function getRuntimeModeValue(rawModeOrRuntime: RawRuntimeModeInput): string | null {
  if (typeof rawModeOrRuntime === 'string') {
    return rawModeOrRuntime;
  }

  if (!rawModeOrRuntime || typeof rawModeOrRuntime !== 'object') {
    return null;
  }

  const runtimeModeCandidate =
    rawModeOrRuntime.authProviderMode ?? rawModeOrRuntime.PUBLIC_AUTH_PROVIDER_MODE ?? rawModeOrRuntime.mode;

  return typeof runtimeModeCandidate === 'string' ? runtimeModeCandidate : null;
}

function mapSupabaseFailureToLoginResult(failure: Extract<SupabaseAdapterResult, { ok: false }>): LoginResult {
  if (failure.code === 'signup_existing') {
    return {
      ok: false,
      error: 'Ya existe una cuenta con ese email. Iniciá sesión para continuar y retomar el onboarding.',
      redirectTo: failure.redirectTo
    };
  }

  if (failure.code === 'invalid_credentials') {
    return {
      ok: false,
      error: 'Credenciales inválidas. Revisá email y contraseña.'
    };
  }

  if (failure.code === 'unavailable') {
    return {
      ok: false,
      error: AUTH_PROVIDER_UNAVAILABLE_MESSAGE
    };
  }

  return {
    ok: false,
    error: failure.error || 'No pudimos iniciar sesión por el momento.'
  };
}

function buildSignupExistingLoginRedirect(returnTo: string | null | undefined): string {
  const loginUrl = new URL('/auth/login', typeof window !== 'undefined' && window.location?.origin ? window.location.origin : 'http://localhost:4321');
  loginUrl.searchParams.set('returnTo', sanitizeReturnTo(returnTo));
  loginUrl.searchParams.set('resume', 'onboarding');
  return `${loginUrl.pathname}${loginUrl.search}`;
}

export async function loginWithProvider(input: LoginWithProviderInput): Promise<LoginResult> {
  let result: SupabaseAdapterResult;
  try {
    result = await input.supabaseLogin(input.attempt);
  } catch {
    result = {
      ok: false,
      code: 'unavailable',
      error: 'Supabase no está disponible en este momento.'
    };
  }

  if (result.ok) {
    markAuthPresent();
    const redirectTo = sanitizeReturnTo(input.attempt.returnTo);

    if (input.dashboardHandoff && result.refreshToken) {
      try {
        return {
          ok: true,
          redirectTo: await createDashboardSessionHandoff({
            dashboardOrigin: input.dashboardHandoff.dashboardOrigin,
            returnTo: redirectTo,
            session: {
              access_token: result.token,
              refresh_token: result.refreshToken
            },
            invoke: input.dashboardHandoff.invoke
          })
        };
      } catch {
        return {
          ok: false,
          error: 'No pudimos preparar el acceso seguro al dashboard. Intentá nuevamente.'
        };
      }
    }

    return {
      ok: true,
      redirectTo
    };
  }

  return mapSupabaseFailureToLoginResult(result);
}

export function createSupabaseLoginAdapterFromEnv(
  env: SupabaseAuthEnv,
  dependencies?: SupabaseAuthDependencies
): (attempt: LoginAttempt) => Promise<SupabaseAdapterResult> {
  return createSupabaseLoginAdapter(env, dependencies);
}

type SignupWithProviderInput = {
  attempt: SignupAttempt;
  supabaseSignup: (attempt: SignupAttempt) => SupabaseAdapterResult | Promise<SupabaseAdapterResult>;
};

export async function signupWithProvider(input: SignupWithProviderInput): Promise<LoginResult> {
  let result: SupabaseAdapterResult;
  try {
    result = await input.supabaseSignup(input.attempt);
  } catch {
    result = {
      ok: false,
      code: 'unavailable',
      error: 'Supabase no está disponible en este momento.'
    };
  }

  if (result.ok) {
    markAuthPresent();
    return {
      ok: true,
      redirectTo: sanitizeReturnTo(input.attempt.returnTo)
    };
  }

  const failure = result as Extract<SupabaseAdapterResult, { ok: false }>;
  if (failure.code === 'signup_existing') {
    return mapSupabaseFailureToLoginResult({
      ...failure,
      redirectTo: failure.redirectTo ?? buildSignupExistingLoginRedirect(input.attempt.returnTo)
    });
  }

  return mapSupabaseFailureToLoginResult(failure);
}

export function createSupabaseSignupAdapterFromEnv(
  env: SupabaseAuthEnv,
  dependencies?: SupabaseAuthDependencies
): (attempt: SignupAttempt) => Promise<SupabaseAdapterResult> {
  return createSupabaseSignupAdapter(env, dependencies);
}
