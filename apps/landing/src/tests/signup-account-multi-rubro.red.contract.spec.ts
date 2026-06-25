/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ACCOUNT_PAGE = 'src/pages/auth/signup/account.astro';
const CREATE_ACCOUNT_BUSINESS_API = 'src/pages/api/signup/create-account-business.ts';
const PENDING_SIGNUP_PROTECT_API = 'src/pages/api/signup/pending-intent/protect.ts';
const PENDING_SIGNUP_HANDOFF = 'src/lib/server/pending-signup-handoff.ts';

async function readSource(path: string): Promise<string> {
  return await import('node:fs/promises').then(({ readFile }) => readFile(path, 'utf8'));
}

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

function renderMultiRubroAccountForm() {
  document.body.innerHTML = `
    <form id="accountForm">
      <input name="nombre" value="Ana" required />
      <p id="error-nombre" class="hidden"></p>
      <input name="apellido" value="García" required />
      <p id="error-apellido" class="hidden"></p>
      <input name="negocioNombre" value="Ana Beauty Studio" required />
      <p id="error-negocioNombre" class="hidden"></p>
      <fieldset id="primary-rubro" aria-describedby="error-rubro" aria-required="true">
        <legend>Rubro principal *</legend>
        <label><input type="radio" name="primaryRubro" value="estetica" data-primary-rubro checked required /> Estética</label>
      </fieldset>
      <fieldset id="rubros" aria-describedby="error-rubro">
        <legend>Rubros adicionales</legend>
        <label><input type="checkbox" name="rubros" value="estetica" /> Estética</label>
        <label><input type="checkbox" name="rubros" value="spa" checked /> Spa</label>
        <label><input type="checkbox" name="rubros" value="maquillaje" checked /> Maquillaje</label>
      </fieldset>
      <select name="rubro" hidden aria-hidden="true">
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

describe('RED contract: visible account creation form supports ordered multi-rubro selection', () => {
  it('renders Rubro o categoría as a multi-select control in the current account form, not as a single select/onboarding-only step', async () => {
    const source = await readSource(ACCOUNT_PAGE);
    const rubroStart = source.indexOf('Rubro principal');
    const rubroSlice = source.slice(rubroStart, source.indexOf('Teléfono Argentina'));

    expect(rubroSlice, 'the visible account creation form must not keep the old single-select rubro contract').not.toMatch(/<select\b[\s\S]{0,160}name=["']rubro["']/i);
    expect(rubroSlice, 'primary rubro remains required for compatibility').toMatch(/(?:data-primary-rubro|name=["']primaryRubro["']|aria-label=["'][^"']*primario)/i);
    expect(rubroSlice, 'additional rubros must be selectable in the same current form').toMatch(/(?:type=["']checkbox["'][\s\S]{0,160}name=["']rubros\[?\]?["']|multiple\b[\s\S]{0,160}name=["']rubros\[?\]?["'])/i);
    expect(source, 'multi-rubro belongs in /auth/signup/account, not an extra onboarding step').not.toMatch(/href=["'][^"']*signup\/onboarding|window\.location\.[\s\S]{0,120}signup\/onboarding/i);
  });

  it('FREE submit preserves primary rubro and sends full ordered selected rubros in the account creation payload', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      ok: true,
      status: 'signup_confirmation_requested'
    }), { status: 202, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/auth/signup/account?plan=FREE&billing=monthly');
    renderMultiRubroAccountForm();

    const { initSignupAccountPage } = await loadController();
    initSignupAccountPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));

    expect(body).toMatchObject({
      rubro: 'estetica',
      business_type: 'estetica',
      selected_business_types: ['estetica', 'spa', 'maquillaje']
    });
  });

  it('PAID submit stores ordered selected rubros in protected pending intent metadata/draft while keeping primary rubro compatible', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({
      pending_signup_reference: 'pending_ref_123',
      serverRedirectUrl: '/billing/subscription?plan=STARTER&billing=monthly&signup_intent=pending_signup&pending_signup_reference=pending_ref_123'
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/auth/signup/account?plan=STARTER&billing=monthly');
    renderMultiRubroAccountForm();

    const { initSignupAccountPage } = await loadController();
    initSignupAccountPage({
      PUBLIC_DASHBOARD_URL: 'http://localhost:4200',
      PUBLIC_SUPABASE_URL: 'https://supabase.test',
      PUBLIC_SUPABASE_ANON_KEY: 'anon-test-key'
    });

    dispatchCredentialsSubmit();

    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(init.body));
    await vi.waitFor(() => expect(sessionStorage.getItem('orvel.signup.pending_signup_intent')).toBeTruthy());
    const protectedIntent = JSON.parse(sessionStorage.getItem('orvel.signup.pending_signup_intent') || '{}');

    expect(body).toMatchObject({
      business_type: 'estetica',
      selected_business_types: ['estetica', 'spa', 'maquillaje']
    });
    expect(protectedIntent).toMatchObject({
      pending_signup_reference: 'pending_ref_123',
      business_type: 'estetica',
      selected_business_types: ['estetica', 'spa', 'maquillaje']
    });
  });
});

describe('RED contract: server signup intent persists full ordered rubro metadata', () => {
  it('FREE confirmation protected metadata stores primary rubro plus full ordered selected rubros for dashboard suggestions', async () => {
    const source = await readSource(CREATE_ACCOUNT_BUSINESS_API);
    const payloadSlice = source.slice(source.indexOf('const confirmationPayload'), source.indexOf('const confirmationInsertRequest'));

    expect(source, 'FREE endpoint must accept selected_business_types/rubros from submit payload as suggestions, not restrict to one value').toMatch(/selected_business_types|selectedBusinessTypes|rubros/i);
    expect(payloadSlice).toMatch(/business_type\s*:\s*businessType/i);
    expect(payloadSlice).toMatch(/selected_business_types\s*:/i);
    expect(payloadSlice).not.toMatch(/selected_business_types\s*:\s*\[\s*businessType\s*\]/i);
  });

  it('PAID pending-signup protection and handoff persist the submitted ordered rubro list instead of synthesizing only the primary', async () => {
    const protectSource = await readSource(PENDING_SIGNUP_PROTECT_API);
    const handoffSource = await readSource(PENDING_SIGNUP_HANDOFF);

    expect(protectSource).toMatch(/selected_business_types\s*:\s*body\?\.selected_business_types|rubros\s*:\s*body\?\.rubros/i);
    expect(handoffSource).toMatch(/selectedBusinessTypes|selected_business_types/i);
    expect(handoffSource, 'server persistence must keep the ordered submitted rubros for downstream dashboard suggestions').not.toMatch(/selected_business_types\s*:\s*\[\s*params\.businessType\s*\]/i);
  });
});

beforeEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.resetModules();
  sessionStorage.clear();
});

afterEach(() => {
  document.body.innerHTML = '';
  sessionStorage.clear();
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
