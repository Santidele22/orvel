import { describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';

import {
  signupWithProvider,
  type LoginResult
} from '../lib/auth-provider';
import {
  ORVEL_SUPABASE_AUTH_STORAGE_KEY,
  createSupabaseBrowserAuthOptions,
  createSupabaseSignupAdapter,
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

  it('FREE manual signup persists explicit FREE plan and incomplete onboarding metadata for dashboard handoff', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: { access_token: 'token' }, user: { id: 'free-user', email: 'santi@orvel.app' } },
      error: null
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp } }) as never
    });

    const result = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'pendiente' }));

    expect(result.ok).toBe(true);
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({
            plan: 'FREE',
            tipoNegocio: 'pendiente',
            onboardingCompleted: false,
            onboarding_completed: false
          })
        })
      })
    );
  });

  it('manual paid signup persists canonical plan but keeps onboarding incomplete until post-billing onboarding', async () => {
    for (const tipoNegocio of ALLOWED_BUSINESS_TYPES) {
      const signUp = vi.fn(async () => ({
        data: { session: { access_token: 'token' }, user: { id: `user-${tipoNegocio}`, email: 'santi@orvel.app' } },
        error: null
      }));

      const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
        createClient: () => ({ auth: { signUp } }) as never
      });

      const result = await signup(makeSignupAttempt({ plan: 'STARTER', tipoNegocio }));

      expect(result.ok).toBe(true);
      expect(signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({
            data: expect.objectContaining({
              plan: 'STARTED',
              tipoNegocio,
              onboardingCompleted: false,
              onboarding_completed: false
            })
          })
        })
      );
    }
  });

  it('duplicate email during FREE signup offers login and resume-onboarding instead of a blocking already-registered error', async () => {
    const duplicateSignup = vi.fn(async () => ({
      ok: false,
      code: 'signup_existing',
      error: 'User already registered'
    })) as unknown as (attempt: SignupAttempt) => Promise<never>;

    const result = (await signupWithProvider({
      attempt: makeSignupAttempt({
        plan: 'FREE',
        tipoNegocio: 'pendiente',
        returnTo: 'http://localhost:4200/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard%2Finicio&plan=FREE'
      }),
      supabaseSignup: duplicateSignup
    })) as LoginResult;

    expect(result.ok).toBe(false);
    expect(duplicateSignup).toHaveBeenCalledOnce();
    expect(result.error).not.toMatch(/user already registered|usuario ya registrado|ya se encuentra registrado/i);
    expect(result.error).toMatch(/inici[aá]\s+sesi[oó]n|login/i);
    expect(result.error).toMatch(/continuar|retomar|onboarding/i);
    expect(result.redirectTo).toMatch(/\/auth\/login/);
    expect(result.redirectTo).toMatch(/returnTo=.*auth%2Fonboarding|resume.*onboarding/i);
  });

  it('account-created/no-session signup asks for email confirmation without redirecting to login', async () => {
    const signUp = vi.fn(async () => ({
      data: {
        session: null,
        user: {
          id: 'new-confirmation-user',
          email: 'santi@orvel.app',
          identities: [{ id: 'identity-1' }]
        }
      },
      error: null
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp } }) as never
    });

    const adapterResult = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'pendiente' }));

    expect(adapterResult.ok).toBe(false);
    expect(adapterResult.code).toBe('email_confirmation_required');
    expect(adapterResult.error).toMatch(/confirm[aá].*email|revis[aá].*email/i);
    expect(adapterResult.redirectTo).toBeUndefined();

    const result = await signupWithProvider({
      attempt: makeSignupAttempt({
        plan: 'FREE',
        tipoNegocio: 'pendiente',
        returnTo: 'https://dashboard.orvel.pro/dashboard/inicio'
      }),
      supabaseSignup: signup
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/confirm[aá].*email|revis[aá].*email/i);
    expect(result.redirectTo).toBeUndefined();
  });

  it('onboarding completion with a Supabase session returns to dashboard instead of auto-redirecting to login', async () => {
    const source = await readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8');

    expect(source).toContain("const safeReturnTo = sanitizeReturnTo(params.get('returnTo'))");
    expect(source).toMatch(/if\s*\(result\.synced\)\s*\{[\s\S]*window\.location\.href\s*=\s*safeReturnTo/);
    expect(source).not.toMatch(/const result = await syncOnboardingMetadata[\s\S]{0,600}showAccountCreatedModal\(\);/);
  });

  it('maps Supabase availability failures to user-friendly signup copy without exposing backend provider names', async () => {
    const unavailableSignup = vi.fn(async () => ({
      ok: false,
      code: 'unavailable',
      error: 'Supabase no está disponible en este momento. Intentá nuevamente.'
    })) as unknown as (attempt: SignupAttempt) => Promise<never>;

    const result = (await signupWithProvider({
      attempt: makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'pendiente' }),
      supabaseSignup: unavailableSignup
    })) as LoginResult;

    expect(result.ok).toBe(false);
    expect(result.error).not.toMatch(/supabase/i);
    expect(result.error).toMatch(/autenticaci[oó]n|intent[aá].*nuevamente|equipo/i);
  });

  it('keeps explicit Supabase browser auth storage options for email/password sessions', async () => {
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

});
