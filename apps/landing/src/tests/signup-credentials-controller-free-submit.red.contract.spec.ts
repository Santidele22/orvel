/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const signupWithProvider = vi.fn();
const createSupabaseSignupAdapterFromEnv = vi.fn(() => vi.fn());

vi.mock('../lib/auth-provider', () => ({
  signupWithProvider,
  createSupabaseSignupAdapterFromEnv
}));

async function loadController() {
  return import('../lib/signup-credentials-page-controller');
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function dispatchCredentialsSubmit() {
  const form = document.getElementById('credentialsForm');
  expect(form).toBeInstanceOf(HTMLFormElement);

  const submitEvent = typeof SubmitEvent === 'function'
    ? new SubmitEvent('submit', { bubbles: true, cancelable: true })
    : new Event('submit', { bubbles: true, cancelable: true });
  form?.dispatchEvent(submitEvent);
  expect(submitEvent.defaultPrevented).toBe(true);
}

function renderCredentialsForm() {
  document.body.innerHTML = `
    <form id="credentialsForm">
      <input name="nombre" value="Ana" required />
      <p id="error-nombre" class="hidden"></p>
      <input name="apellido" value="García" required />
      <p id="error-apellido" class="hidden"></p>
      <input name="negocioNombre" value="Ana Beauty Studio" required />
      <p id="error-negocioNombre" class="hidden"></p>
      <input name="telefonoCaracteristica" value="294" required />
      <p id="error-telefonoCaracteristica" class="hidden"></p>
      <input name="telefonoNumero" value="667161" required />
      <p id="error-telefonoNumero" class="hidden"></p>
      <input name="email" value="ana@example.com" required />
      <p id="error-email" class="hidden"></p>
      <input id="password" name="password" value="password-segura-123" required />
      <p id="error-password" class="hidden"></p>
      <input id="confirmPassword" name="confirm" value="password-segura-123" required />
      <p id="error-confirm" class="hidden"></p>
      <p id="signupError" class="hidden"></p>
      <button type="submit">Continuar</button>
    </form>
  `;
}

describe('RED contract: FREE signup credentials controller submission', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
    window.history.pushState({}, '', '/auth/signup/credentials?plan=FREE&billing=monthly');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      protected_pending_signup_intent: {
        email_encrypted: '{\"v\":\"pending_signup_pii_v1\",\"alg\":\"AES-GCM\",\"iv\":\"iv\",\"ct\":\"ct\"}',
        email_hmac: 'email-hmac',
        first_name_encrypted: 'first-name-ciphertext',
        first_name_hmac: 'first-name-hmac',
        last_name_encrypted: 'last-name-ciphertext',
        last_name_hmac: 'last-name-hmac',
        phone_encrypted: 'phone-ciphertext',
        phone_hmac: 'phone-hmac',
        business_name_encrypted: 'business-name-ciphertext',
        business_name_hmac: 'business-name-hmac',
        pii_crypto_version: 'pending_signup_pii_v1'
      }
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    sessionStorage.clear();
    renderCredentialsForm();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('valid FREE submit defers account creation and stores only protected onboarding handoff data', async () => {
    const { initSignupCredentialsPage } = await loadController();
    initSignupCredentialsPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => {
      expect(signupWithProvider).not.toHaveBeenCalled();
      expect(createSupabaseSignupAdapterFromEnv).not.toHaveBeenCalled();
      expect(window.location.href).toBe('http://localhost:3000/auth/signup/onboarding?onboarding_required=true&account_created_modal=welcome_login&loginUrl=%2Fauth%2Flogin&plan=FREE&billing=monthly');
    });

    expect(sessionStorage.getItem('orvel.signup.plan')).toBe('FREE');
    expect(sessionStorage.getItem('orvel.signup.billing')).toBe('monthly');
    const pendingSignupIntent = JSON.parse(sessionStorage.getItem('orvel.signup.pending_signup_intent') || '{}');
    expect(typeof pendingSignupIntent.email_encrypted).toBe('string');
    expect(typeof pendingSignupIntent.email_hmac).toBe('string');
    expect(sessionStorage.getItem('orvel.signup.email')).toBeNull();
    expect(sessionStorage.getItem('orvel.signup.telefono')).toBeNull();
    expect(JSON.stringify(sessionStorage)).not.toContain('ana@example.com');
    expect(JSON.stringify(sessionStorage)).not.toContain('+54294667161');
    expect(JSON.stringify(sessionStorage)).not.toContain('password-segura-123');
  });

  it('defers FREE account creation at credentials submit and continues to onboarding without a rubro error', async () => {
    signupWithProvider.mockResolvedValueOnce({
      ok: false,
      error: 'Seleccioná el rubro o categoría de tu negocio antes de crear la cuenta.'
    });
    const { initSignupCredentialsPage } = await loadController();
    initSignupCredentialsPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => {
      expect(signupWithProvider).not.toHaveBeenCalled();
      expect(createSupabaseSignupAdapterFromEnv).not.toHaveBeenCalled();
      expect(window.location.href).toBe('http://localhost:3000/auth/signup/onboarding?onboarding_required=true&account_created_modal=welcome_login&loginUrl=%2Fauth%2Flogin&plan=FREE&billing=monthly');
    });

    const signupError = document.getElementById('signupError');
    expect(signupError?.textContent).not.toMatch(/Seleccion[aá] el rubro|categor[ií]a|crear la cuenta/i);
    expect(signupError?.classList.contains('hidden')).toBe(true);
    expect(sessionStorage.getItem('orvel.signup.plan')).toBe('FREE');
    expect(sessionStorage.getItem('orvel.signup.billing')).toBe('monthly');
  });
});
