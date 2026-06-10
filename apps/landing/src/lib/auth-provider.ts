import {
  createSupabaseLoginAdapter,
  type LoginAttempt,
  type SupabaseAdapterResult,
  type SupabaseAuthDependencies,
  type SupabaseAuthEnv,
  createSupabaseOAuthAdapter,
  createSupabaseSignupAdapter,
  type SignupAttempt
} from './supabase-auth-adapter';
import { markSignupOnboardingCompleted } from './onboarding-signup-state';
import {
  initEncryption,
  encryptToken,
  decryptToken,
  isEncryptionReady
} from './encrypted-token-storage';

export const ORVEL_SESSION_KEY = 'orvel.session.v1';
const DEFAULT_DASHBOARD_PATH = '/dashboard/inicio';
const PARAM_BLOCKLIST = /^(access_token|refresh_token|token|id_token|code|preapproval_id|collection_id|payment_id|status|status_detail|merchant_order_id|external_reference|checkout_session_id)$/i;
const TOKEN_OR_PAYMENT_TEXT = /(access_token|refresh_token|id_token|preapproval_id|collection_id|payment_id|merchant_order_id|external_reference|checkout_session_id)/i;

function resolveDashboardBaseUrl(): URL | null {
  const candidate = import.meta.env.PUBLIC_DASHBOARD_URL?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!url.pathname.endsWith('/')) url.pathname = `${url.pathname}/`;
    url.search = '';
    url.hash = '';
    return url;
  } catch {
    return null;
  }
}

function defaultDashboardReturnTo(): string {
  const dashboardBaseUrl = resolveDashboardBaseUrl();
  if (!dashboardBaseUrl) return DEFAULT_DASHBOARD_PATH;

  const basePath = dashboardBaseUrl.pathname;
  const relativePath = DEFAULT_DASHBOARD_PATH.startsWith(basePath)
    ? DEFAULT_DASHBOARD_PATH.slice(basePath.length)
    : DEFAULT_DASHBOARD_PATH.replace(/^\//, '');
  return new URL(relativePath, dashboardBaseUrl).toString();
}

export interface LoginResult {
  ok: boolean;
  redirectTo?: string;
  error?: string;
}

type LoginWithProviderInput = {
  attempt: LoginAttempt;
  supabaseLogin: (attempt: LoginAttempt) => SupabaseAdapterResult | Promise<SupabaseAdapterResult>;
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

type OrvelSession = {
  version: 'v1' | 'v2';
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
  };
  issuedAt: number;
  expiresAt: number;
};

function sanitizeReturnTo(returnTo: string | null | undefined): string {
  if (!returnTo) {
    return defaultDashboardReturnTo();
  }

  const value = returnTo.trim();
  if (value.startsWith('/')) {
    if (value.startsWith('//')) {
      return defaultDashboardReturnTo();
    }
    try {
      const parsed = new URL(value, 'https://dashboard.orvel.local');
      if (parsed.origin !== 'https://dashboard.orvel.local') return defaultDashboardReturnTo();
      for (const key of parsed.searchParams.keys()) {
        if (PARAM_BLOCKLIST.test(key)) return defaultDashboardReturnTo();
      }
      if (TOKEN_OR_PAYMENT_TEXT.test(parsed.hash) || TOKEN_OR_PAYMENT_TEXT.test(value)) return defaultDashboardReturnTo();
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return defaultDashboardReturnTo();
    }
  }

  try {
    const requested = new URL(value);
    if (TOKEN_OR_PAYMENT_TEXT.test(value)) return defaultDashboardReturnTo();
    for (const key of requested.searchParams.keys()) {
      if (PARAM_BLOCKLIST.test(key)) return defaultDashboardReturnTo();
    }
    const dashboardBaseUrl = resolveDashboardBaseUrl();
    if (
      dashboardBaseUrl &&
      requested.origin === dashboardBaseUrl.origin &&
      requested.pathname.startsWith(dashboardBaseUrl.pathname.replace(/\/$/, ''))
    ) {
      return requested.toString();
    }
  } catch {
    // fall through
  }

  return defaultDashboardReturnTo();
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

/**
 * Get decrypted token from stored session
 * Returns null if no session or encryption not initialized
 */
export async function getDecryptedSessionToken(): Promise<string | null> {
  const stored = localStorage.getItem(ORVEL_SESSION_KEY);
  if (!stored) {
    return null;
  }

  try {
    const session: OrvelSession = JSON.parse(stored);

    // v2 = encrypted, v1 = plain text
    if (session.version === 'v2' && isEncryptionReady()) {
      return decryptToken(session.token);
    } else if (session.version === 'v1') {
      // Legacy format - return as-is (but upgrade on next login)
      return session.token;
    }

    return null;
  } catch {
    return null;
  }
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
  if (failure.code === 'invalid_credentials') {
    return {
      ok: false,
      error: 'Credenciales inválidas. Revisá email y contraseña.'
    };
  }

  if (failure.code === 'unavailable') {
    return {
      ok: false,
      error: 'Supabase no está disponible en este momento. Intentá nuevamente.'
    };
  }

  return {
    ok: false,
    error: failure.error || 'No pudimos iniciar sesión por el momento.'
  };
}

async function persistSupabaseSession(
  attempt: LoginAttempt | SignupAttempt,
  result: Extract<SupabaseAdapterResult, { ok: true }>
): Promise<void> {
  // Initialize encryption
  await initEncryption();

  const now = Date.now();

  // Encrypt token before storing
  const encryptedToken = await encryptToken(result.token);

  const session: OrvelSession = {
    version: 'v2', // Version 2 indicates encrypted storage
    token: encryptedToken,
    user: {
      id: result.user.id,
      email: result.user.email,
      name:
        result.user.nombre && result.user.apellido
          ? `${result.user.nombre} ${result.user.apellido}`
          : 'Usuario Orvel'
    },
    issuedAt: now,
    expiresAt: now + 1000 * 60 * 60 * 8
  };

  localStorage.setItem(ORVEL_SESSION_KEY, JSON.stringify(session));
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
    await persistSupabaseSession(input.attempt, result);
    return {
      ok: true,
      redirectTo: sanitizeReturnTo(input.attempt.returnTo)
    };
  }

  return mapSupabaseFailureToLoginResult(result);
}

export async function loginWithGoogle(input: string | { redirectTo: string; plan?: string }) {
  const oauthAdapter = createSupabaseOAuthAdapter({
    SUPABASE_URL: import.meta.env.PUBLIC_SUPABASE_URL,
    SUPABASE_ANON_KEY: import.meta.env.PUBLIC_SUPABASE_ANON_KEY
  });
  return await oauthAdapter('google', input);
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
    await persistSupabaseSession(input.attempt, result);
    return {
      ok: true,
      redirectTo: sanitizeReturnTo(input.attempt.returnTo)
    };
  }

  return mapSupabaseFailureToLoginResult(result as Extract<SupabaseAdapterResult, { ok: false }>);
}

export function createSupabaseSignupAdapterFromEnv(
  env: SupabaseAuthEnv,
  dependencies?: SupabaseAuthDependencies
): (attempt: SignupAttempt) => Promise<SupabaseAdapterResult> {
  return createSupabaseSignupAdapter(env, dependencies);
}
