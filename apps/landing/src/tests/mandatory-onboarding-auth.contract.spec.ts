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

  it('FREE pending-rubro payload is never accepted as an Auth creation payload', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: { access_token: 'token' }, user: { id: 'free-user', email: 'santi@orvel.app' } },
      error: null
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp } }) as never
    });

    const result = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'pendiente' }));

    // Credentials submit must defer before this adapter is invoked. If a
    // pending-rubro payload reaches the Auth creation boundary, it must still
    // be rejected before Supabase Auth so the final onboarding/rubro step is
    // the only account-creation boundary.
    expect(result.ok).toBe(false);
    expect(String(result.code)).toMatch(/onboarding|required|validation/i);
    expect(result.error).toMatch(/rubro|categor|tipo|negocio|seleccion/i);
    expect(signUp).not.toHaveBeenCalled();
  });

  it('FREE final onboarding/rubro submit creates Auth with the selected rubro metadata and never falls back to pendiente', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: { access_token: 'token' }, user: { id: 'free-user', email: 'santi@orvel.app' } },
      error: null
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp } }) as never
    });

    const result = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'peluqueria' }));

    expect(result.ok).toBe(true);
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({
            plan: 'FREE',
            tipoNegocio: 'peluqueria'
          })
        })
      })
    );
    expect(signUp).not.toHaveBeenCalledWith(
      expect.objectContaining({
        options: expect.objectContaining({
          data: expect.objectContaining({ tipoNegocio: 'pendiente' })
        })
      })
    );
  });

  it('FREE final submit depends on complete_signup_onboarding confirmation before reporting success', async () => {
    const signUp = vi.fn(async () => ({
      data: { session: { access_token: 'token' }, user: { id: 'free-user', email: 'santi@orvel.app' } },
      error: null
    }));
    const rpc = vi.fn(async () => ({
      data: null,
      error: { message: 'RPC unavailable' }
    }));

    const signup = createSupabaseSignupAdapter(SUPABASE_ENV, {
      createClient: () => ({ auth: { signUp }, rpc }) as never
    });

    const result = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'peluqueria' }));

    // Approved FREE contract: success is only valid after an Auth session and
    // complete_signup_onboarding-created backend identity are both confirmed.
    expect(signUp).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('complete_signup_onboarding', expect.objectContaining({
      p_business_type: 'peluqueria',
      p_plan_code: 'FREE'
    }));
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/configuraci[oó]n|onboarding|confirm/i);
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

    const adapterResult = await signup(makeSignupAttempt({ plan: 'FREE', tipoNegocio: 'peluqueria' }));

    expect(adapterResult.ok).toBe(false);
    expect(adapterResult.code).toBe('email_confirmation_required');
    expect(adapterResult.error).toMatch(/confirm[aá].*email|revis[aá].*email/i);
    expect(adapterResult.redirectTo).toBeUndefined();

    const result = await signupWithProvider({
      attempt: makeSignupAttempt({
        plan: 'FREE',
        tipoNegocio: 'peluqueria',
        returnTo: 'https://dashboard.orvel.pro/dashboard/inicio'
      }),
      supabaseSignup: signup
    });

    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/confirm[aá].*email|revis[aá].*email/i);
    expect(result.redirectTo).toBeUndefined();
  });

  it('successful FREE signup sanitizes obsolete onboarding returnTo to dashboard home', async () => {
    const successfulSignup = vi.fn(async () => ({
      ok: true,
      token: 'session-token',
      user: {
        id: 'free-user',
        email: 'santi@orvel.app',
        nombre: 'Santi',
        apellido: 'Perez'
      }
    })) as unknown as (attempt: SignupAttempt) => Promise<never>;

    const result = await signupWithProvider({
      attempt: makeSignupAttempt({
        plan: 'FREE',
        tipoNegocio: 'pendiente',
        returnTo: '/auth/signup/onboarding?onboarding_required=true&account_created_modal=welcome_login&loginUrl=%2Fauth%2Flogin&plan=FREE&billing=monthly'
      }),
      supabaseSignup: successfulSignup
    });

    expect(result.ok).toBe(true);
    expect(result.redirectTo).toBe('http://localhost:4200/dashboard/inicio');
    expect(new URL(result.redirectTo ?? '').pathname).toBe('/dashboard/inicio');
    expect(result.redirectTo).not.toContain('/auth/signup/onboarding');
  });

  it('onboarding completion with a Supabase session shows welcome modal instead of auto-redirecting to login or dashboard', async () => {
    const source = await readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8');

    expect(source).toContain("const safeReturnTo = sanitizeReturnTo(params.get('returnTo'))");
    expect(source).toMatch(/if\s*\(result\.synced\)\s*\{[\s\S]{0,220}showAccountCreatedModal\(\);/);
    expect(source).not.toMatch(/if\s*\(result\.synced\)\s*\{[\s\S]{0,260}window\.location\.href\s*=\s*safeReturnTo/);
    expect(source).not.toMatch(/setTimeout\s*\([\s\S]{0,160}(?:safeLoginUrl|safeReturnTo|redirectToLogin)/i);
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

  it('onboarding failure copy hides backend, Supabase, RPC, and provider internals', async () => {
    const source = await readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8');
    const failureCopyMatch = source.match(/backendConfirmationFailureMessage\s*=\s*(['"`])(?<copy>[\s\S]*?)\1/);

    expect(failureCopyMatch?.groups?.copy).toBeTruthy();
    expect(failureCopyMatch?.groups?.copy).not.toMatch(/backend|supabase|rpc|provider/i);
    expect(failureCopyMatch?.groups?.copy).toMatch(/configuraci[oó]n|confirm|intent[aá]|continuar/i);
  });

  it('obsolete FREE onboarding path bypasses the legacy security failure toward dashboard', async () => {
    const source = await readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8');
    const freeHandler = source.match(/const completeFreeSignupFromOnboarding[\s\S]*?;\n\s*};/i)?.[0] ?? '';

    expect(freeHandler).toMatch(/ok\s*:\s*true/i);
    expect(freeHandler).toMatch(/redirectTo\s*:\s*safeReturnTo/i);
    expect(source).toMatch(/window\.location\.(?:assign|href)[\s\S]{0,120}signupResult\.redirectTo/i);
    expect(source).not.toContain('Por seguridad, el alta gratis se completa en el mismo flujo donde ingresaste la contraseña');
  });

  it('signup flow does not persist passwords in browser storage keys or onboarding URLs', async () => {
    const [storageKeysSource, authProviderSource, onboardingSource] = await Promise.all([
      readFile(new URL('../lib/browser-storage-keys.ts', import.meta.url), 'utf8'),
      readFile(new URL('../lib/auth-provider.ts', import.meta.url), 'utf8'),
      readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8')
    ]);
    const combinedSources = `${storageKeysSource}\n${authProviderSource}\n${onboardingSource}`;

    expect(combinedSources).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(combinedSources).not.toMatch(/(?:localStorage|sessionStorage)\.getItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(combinedSources).not.toMatch(/searchParams\.set\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(combinedSources).not.toMatch(/new\s+URLSearchParams\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(storageKeysSource).not.toMatch(/password|confirmPassword|contraseñ/i);
  });

  it('onboarding page collects only rubro/category and welcome login, without password fields or standalone login button', async () => {
    const source = await readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8');
    const formMarkup = source.slice(source.indexOf('<form id="completeForm"'), source.indexOf('</form>'));
    const welcomeMarkup = source.slice(source.indexOf('<div id="accountCreatedModal"'));

    expect(formMarkup).toMatch(/name="rubro"/);
    expect(formMarkup).not.toMatch(/type="password"|name="password"|name="confirm"|onboardingPassword|onboardingConfirmPassword/i);
    expect(formMarkup).not.toMatch(/Ir al login/i);
    expect(source).not.toMatch(/id="loginLink"/);
    expect(welcomeMarkup).toMatch(/Iniciar sesión/);
    expect(welcomeMarkup).not.toMatch(/Ir al login/i);
  });

  it('successful FREE onboarding auth clears protected handoff session storage before showing success', async () => {
    const source = await readFile(new URL('../pages/auth/signup/onboarding.astro', import.meta.url), 'utf8');
    const handoffKeysMatch = source.match(/FREE_SIGNUP_HANDOFF_STORAGE_KEYS\s*=\s*\[([\s\S]*?)\]\s*as const/);

    expect(handoffKeysMatch?.[1]).toContain('SIGNUP_STORAGE_KEYS.pendingSignupIntent');
    expect(handoffKeysMatch?.[1]).not.toContain('SIGNUP_STORAGE_KEYS.email');
    expect(handoffKeysMatch?.[1]).not.toContain('SIGNUP_STORAGE_KEYS.nombre');
    expect(handoffKeysMatch?.[1]).not.toContain('SIGNUP_STORAGE_KEYS.apellido');
    expect(handoffKeysMatch?.[1]).not.toContain('SIGNUP_STORAGE_KEYS.negocioNombre');
    expect(handoffKeysMatch?.[1]).not.toContain('SIGNUP_STORAGE_KEYS.telefono');
    expect(handoffKeysMatch?.[1]).toContain('SIGNUP_STORAGE_KEYS.tipoNegocio');
    expect(handoffKeysMatch?.[1]).toContain('orvel.signup.selectedRubros');
    expect(source).toMatch(/for\s*\(const key of FREE_SIGNUP_HANDOFF_STORAGE_KEYS\)\s*\{\s*sessionStorage\.removeItem\(key\);\s*\}/);
    expect(source).toMatch(/continueLink\.addEventListener\('click', clearFreeSignupHandoffStorage\)/);
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
