import { describe, expect, it, vi } from 'vitest';

import {
  ORVEL_SUPABASE_AUTH_STORAGE_KEY,
  createSupabaseBrowserAuthOptions,
  createSupabaseOAuthAdapter,
  createSupabaseSignupAdapter,
  getOAuthExchangeDiagnostics,
  type SignupAttempt
} from '../lib/supabase-auth-adapter';

const SUPABASE_ENV = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon-key'
};

const ALLOWED_BUSINESS_TYPES = ['uñas', 'peluqueria', 'barberia', 'spa', 'pestañas', 'cejas', 'masajes', 'otro'] as const;

function makeSignupAttempt(overrides: Partial<SignupAttempt> = {}): SignupAttempt {
  return {
    nombre: 'Santi',
    apellido: 'Perez',
    negocioNombre: 'Orvel Studio',
    tipoNegocio: 'peluqueria',
    telefono: '+54 11 5555 0101',
    email: 'santi@orvel.app',
    password: 'strong-password-123',
    plan: 'STARTED',
    ...overrides
  };
}

describe('Contract: mandatory onboarding before auth account activation', () => {
  it('manual credentials reject signup before Supabase when canonical plan is missing', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: { access_token: 'token' }, user: { id: 'user-1', email: 'santi@orvel.app' } },
      error: null
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp } }) as never
    });

    const result = await signup(makeSignupAttempt({ plan: undefined }));

    expect(result.ok).toBe(false);
    expect(String(result.code)).toMatch(/onboarding|required|validation/i);
    expect(result.error).toMatch(/plan/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('manual credentials reject signup before Supabase when business type is missing or unsupported', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: { access_token: 'token' }, user: { id: 'user-1', email: 'santi@orvel.app' } },
      error: null
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp } }) as never
    });

    for (const tipoNegocio of ['', 'generic', 'salon', 'restaurant']) {
      const result = await signup(makeSignupAttempt({ tipoNegocio }));

      expect(result.ok).toBe(false);
      expect(String(result.code)).toMatch(/onboarding|required|validation/i);
      expect(result.error).toMatch(/tipo|business/i);
    }

    expect(signUp).not.toHaveBeenCalled();
  });

  it('manual signup persists canonical plan and each allowed business type in Supabase metadata', async () => {
    for (const tipoNegocio of ALLOWED_BUSINESS_TYPES) {
      const signUp = vi.fn(async () => ({
        data: { session: { access_token: 'token' }, user: { id: `user-${tipoNegocio}`, email: 'santi@orvel.app' } },
        error: null
      }));

      const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
        createClient: () => ({ auth: { signUp } }) as never
      });

      const result = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio }));

      expect(result.ok).toBe(true);
      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: expect.objectContaining({
              plan: 'STARTED',
              tipoNegocio,
              onboardingCompleted: true
            })
          })
        })
      );
    }
  });

  it('Google OAuth redirects to persisted onboarding when plan and business type are not completed', async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    const oauth = createSupabaseOAuthAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signInWithOAuth } }) as never
    }) as unknown as (provider: 'google', input: { redirectTo: string; plan?: string; tipoNegocio?: string }) => Promise<{ ok: boolean }>;

    const result = await oauth('google', { redirectTo: 'https://orvel.app/dashboard' });

    expect(result.ok).toBe(true);
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: expect.stringMatching(/\/auth\/onboarding|\/onboarding/),
        queryParams: expect.objectContaining({
          onboarding_required: 'true'
        })
      })
    });
  });

  it('Google OAuth starts signup intent with STARTER fallback plan from static pricing when public.plans is missing', async () => {
    const signInWithOAuth = vi.fn(async () => ({ error: null }));
    const createClient = vi.fn(() => ({ auth: { signInWithOAuth } }) as never);
    const oauthSignupIntentStore = {
      create: vi.fn(async (intent) => ({
        id: 'signup-intent-started-google',
        plan: intent.plan,
        provider: intent.provider,
        expiresAt: intent.expiresAt
      })),
      consume: vi.fn()
    };
    const oauth = createSupabaseOAuthAdapter(SUPABASE_ENV, {
      createClient,
      oauthSignupIntentStore
    }) as unknown as (provider: 'google', input: { redirectTo: string; plan?: string; tipoNegocio?: string }) => Promise<{ ok: boolean }>;

    const result = await oauth('google', {
      redirectTo: 'https://orvel.app/auth/signup/business-type?plan=STARTER',
      plan: 'STARTER'
    });

    expect(result.ok).toBe(true);
    expect(createClient).toHaveBeenCalledWith(
      SUPABASE_ENV.SUPABASE_URL,
      SUPABASE_ENV.SUPABASE_ANON_KEY,
      expect.objectContaining({ auth: expect.objectContaining({ flowType: 'pkce' }) })
    );
    expect(oauthSignupIntentStore.create).toHaveBeenCalledWith(
      expect.objectContaining({ plan: 'STARTED', provider: 'google' })
    );
    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: expect.objectContaining({
        redirectTo: expect.stringContaining('plan=STARTED'),
        queryParams: expect.objectContaining({ onboarding_required: 'true' })
      })
    });
  });

  it('uses the same explicit PKCE storage options for OAuth start and callback clients', async () => {
    const storage = globalThis.localStorage;
    const startOptions = createSupabaseBrowserAuthOptions(storage);
    const callbackOptions = createSupabaseBrowserAuthOptions(storage);

    expect(startOptions).toEqual(callbackOptions);
    expect(startOptions?.auth).toEqual(
      expect.objectContaining({
        flowType: 'pkce',
        persistSession: true,
        detectSessionInUrl: false,
        storageKey: ORVEL_SUPABASE_AUTH_STORAGE_KEY,
        storage
      })
    );
  });

  it('keeps OAuth exchange failure diagnostics safe and actionable', () => {
    const diagnostics = getOAuthExchangeDiagnostics({
      name: 'AuthApiError',
      code: 'bad_code_verifier',
      status: 400,
      message: 'contains-sensitive-provider-details',
      access_token: 'must-not-log'
    });

    expect(diagnostics).toEqual({
      name: 'AuthApiError',
      code: 'bad_code_verifier',
      status: 400
    });
    expect(JSON.stringify(diagnostics)).not.toContain('contains-sensitive-provider-details');
    expect(JSON.stringify(diagnostics)).not.toContain('must-not-log');
  });
});
