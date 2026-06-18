/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

async function loadController() {
  return import('../lib/signup-account-page-controller');
}

function dispatchCredentialsSubmit() {
  const form = document.getElementById('accountForm');
  expect(form).toBeInstanceOf(HTMLFormElement);

  const submitEvent = typeof SubmitEvent === 'function'
    ? new SubmitEvent('submit', { bubbles: true, cancelable: true })
    : new Event('submit', { bubbles: true, cancelable: true });
  form?.dispatchEvent(submitEvent);
  expect(submitEvent.defaultPrevented).toBe(true);
}

function renderCredentialsForm() {
  document.body.innerHTML = `
    <form id="accountForm">
      <input name="nombre" value="Ana" required />
      <p id="error-nombre" class="hidden"></p>
      <input name="apellido" value="García" required />
      <p id="error-apellido" class="hidden"></p>
      <input name="negocioNombre" value="Ana Beauty Studio" required />
      <p id="error-negocioNombre" class="hidden"></p>
      <select name="rubro" required>
        <option value="estetica" selected>Estética</option>
      </select>
      <p id="error-rubro" class="hidden"></p>
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
    <section id="accountCreatedModal" class="hidden" aria-hidden="true">
      <h2 id="accountCreatedModalTitle" tabindex="-1">Cuenta creada</h2>
      <a id="accountCreatedContinue" href="/auth/login">Ir a iniciar sesión</a>
    </section>
  `;
}

describe('RED contract: FREE signup credentials controller submission', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/auth/signup/account?plan=FREE&billing=monthly');
    sessionStorage.clear();
    renderCredentialsForm();
  });

  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
  });

  it('posts a valid FREE payload to account/business creation and shows the welcome login modal before navigation', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      user_id: 'user-1',
      business_id: 'business-1',
      plan: 'FREE',
      subscription_status: 'active'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const { initSignupAccountPage } = await loadController();
    initSignupAccountPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith('/api/signup/create-account-business', expect.objectContaining({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'ana@example.com',
        password: 'password-segura-123',
        nombre: 'Ana',
        apellido: 'García',
        negocioNombre: 'Ana Beauty Studio',
        rubro: 'estetica',
        telefono: '+54294667161',
        plan: 'FREE'
      })
    }));

    const modal = document.getElementById('accountCreatedModal');
    const continueLink = document.getElementById('accountCreatedContinue') as HTMLAnchorElement | null;
    await vi.waitFor(() => {
      expect(modal?.classList.contains('hidden')).toBe(false);
      expect(modal?.getAttribute('aria-hidden')).toBe('false');
      expect(continueLink?.getAttribute('href')).toBe('/auth/login');
    });

    const signupError = document.getElementById('signupError');
    expect(signupError?.classList.contains('hidden')).toBe(true);
  });

  it('surfaces account/business creation endpoint failures without weakening phone validation coverage', async () => {
    const duplicateEmailError = 'Ya existe una cuenta con ese email.';
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      ok: false,
      error: 'signup_existing',
      message: duplicateEmailError
    }), { status: 409, headers: { 'Content-Type': 'application/json' } }));

    const { initSignupAccountPage } = await loadController();
    initSignupAccountPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const signupError = document.getElementById('signupError');
    const submitButton = document.querySelector<HTMLButtonElement>('#accountForm button[type="submit"]');
    await vi.waitFor(() => {
      expect(signupError?.textContent).toBe(duplicateEmailError);
      expect(submitButton?.disabled).toBe(false);
      expect(submitButton?.textContent).toBe('Continuar');
    });
    expect(signupError?.textContent).not.toBe('No pudimos crear tu cuenta. Reintentá en unos segundos.');
  });
});
