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
    sessionStorage.clear();
    renderCredentialsForm();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('submits a valid FREE payload through signupWithProvider with normalized 294 phone and surfaces known provider failures', async () => {
    const providerFailure = createDeferred<{ ok: false; error: string }>();
    signupWithProvider.mockReturnValueOnce(providerFailure.promise);
    const duplicateEmailError = 'Ya existe una cuenta con ese email. Iniciá sesión para continuar y retomar el onboarding.';

    const { initSignupCredentialsPage } = await loadController();
    initSignupCredentialsPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => expect(signupWithProvider).toHaveBeenCalledTimes(1));
    providerFailure.resolve({ ok: false, error: duplicateEmailError });
    expect(createSupabaseSignupAdapterFromEnv).toHaveBeenCalledWith({
      SUPABASE_URL: 'https://supabase.test',
      SUPABASE_ANON_KEY: 'anon-test-key'
    });
    expect(signupWithProvider).toHaveBeenCalledWith(expect.objectContaining({
      attempt: expect.objectContaining({
        nombre: 'Ana',
        apellido: 'García',
        negocioNombre: 'Ana Beauty Studio',
        tipoNegocio: 'pendiente',
        telefono: '+54294667161',
        email: 'ana@example.com',
        password: 'password-segura-123',
        plan: 'FREE',
        returnTo: 'http://localhost:4200/auth/onboarding?onboarding_required=true&returnTo=%2Fdashboard%2Finicio&plan=FREE&billing=monthly'
      })
    }));

    const signupError = document.getElementById('signupError');
    const submitButton = document.querySelector<HTMLButtonElement>('#credentialsForm button[type="submit"]');
    await vi.waitFor(() => {
      expect(signupError?.textContent).toBe(duplicateEmailError);
      expect(submitButton?.disabled).toBe(false);
      expect(submitButton?.textContent).toBe('Continuar');
    });
    expect(signupError?.textContent).not.toBe('No pudimos crear tu cuenta. Reintentá en unos segundos.');
  });
});
