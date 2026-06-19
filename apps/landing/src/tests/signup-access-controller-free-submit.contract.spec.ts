/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const protectedIntent = {
  email_encrypted: '{"v":"pending_signup_pii_v1","alg":"AES-GCM","iv":"iv","ct":"ct"}',
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
};

async function loadController() {
  return import('../lib/signup-access-page-controller');
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

describe('contract: FREE signup access same-runtime finalization', () => {
  beforeEach(async () => {
    vi.useRealTimers();
    vi.clearAllMocks();
    vi.resetModules();
    window.history.pushState({}, '', '/auth/signup/credentials?plan=FREE&billing=monthly');
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === '/api/signup/pending-intent/protect') {
        return new Response(JSON.stringify({ protected_pending_signup_intent: protectedIntent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/signup/pending-intent/finalize') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        return new Response(JSON.stringify({ ok: true, email: 'ana@example.com', received: body }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }));
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

  it('valid FREE access submit protects data, creates the account immediately, and shows welcome/login without navigation', async () => {
    const { initSignupCredentialsPage } = await loadController();
    initSignupCredentialsPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => {
      expect(document.getElementById('freeSignupWelcomeModal')?.classList.contains('flex')).toBe(true);
    });

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(window.location.href).toBe('http://localhost:3000/auth/signup/credentials?plan=FREE&billing=monthly');
    expect(sessionStorage.getItem('orvel.signup.plan')).toBe('FREE');
    expect(sessionStorage.getItem('orvel.signup.billing')).toBe('monthly');
    expect(sessionStorage.getItem('orvel.signup.pending_signup_intent')).toBeNull();
    expect(sessionStorage.getItem('orvel.signup.email')).toBeNull();
    expect(sessionStorage.getItem('orvel.signup.telefono')).toBeNull();
    expect(JSON.stringify(sessionStorage)).not.toContain('ana@example.com');
    expect(JSON.stringify(sessionStorage)).not.toContain('+54294667161');
    expect(JSON.stringify(sessionStorage)).not.toContain('password-segura-123');
    const finalizeBody = JSON.parse(String((fetch as ReturnType<typeof vi.fn>).mock.calls[1][1]?.body));
    expect(finalizeBody).toMatchObject({
      pending_signup_intent: protectedIntent,
      password: 'password-segura-123',
      business_type: 'otro',
      plan_code: 'FREE',
      return_to: '/auth/login'
    });
    expect(JSON.stringify((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1])).not.toContain('password-segura-123');
    expect(document.getElementById('freeSignupWelcomeLogin')?.getAttribute('href')).toBe('/auth/login');
    expect(sessionStorage.getItem('orvel.signup.pending_signup_intent')).toBeNull();
    expect(JSON.stringify(sessionStorage)).not.toContain('password-segura-123');
  });

  it('shows the duplicate account modal when FREE finalization reports an existing email', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/signup/pending-intent/protect') {
        return new Response(JSON.stringify({ protected_pending_signup_intent: protectedIntent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (url === '/api/signup/pending-intent/finalize') {
        return new Response(JSON.stringify({ ok: false, error: 'EMAIL_ALREADY_REGISTERED' }), { status: 409, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: false }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }));
    const { initSignupCredentialsPage } = await loadController();
    initSignupCredentialsPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => {
      expect(document.getElementById('existingAccountModal')?.classList.contains('flex')).toBe(true);
    });

    expect(document.getElementById('existingAccountLogin')?.getAttribute('href')).toBe('/auth/login');
    expect(document.getElementById('freeSignupWelcomeModal')?.classList.contains('flex')).not.toBe(true);
  });
});
