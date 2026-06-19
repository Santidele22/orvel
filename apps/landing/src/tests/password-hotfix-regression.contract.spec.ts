/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const CREDENTIALS_PAGE_PATH = new URL('../pages/auth/signup/account.astro', import.meta.url);
const ONBOARDING_PAGE_PATH = new URL('../pages/auth/signup/onboarding.astro', import.meta.url);
const CREDENTIALS_CONTROLLER_PATH = new URL('../lib/signup-access-page-controller.ts', import.meta.url);

async function loadSource(path: URL): Promise<string> {
  return readFile(path.protocol === 'file:' ? path : join(process.cwd(), path.pathname.replace(/^\//, '')), 'utf8');
}

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

function renderPaidCredentialsForm(password = '', confirm = '') {
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
      <div id="passwordFields">
        <input id="password" name="password" value="${password}" required />
        <p id="error-password" class="hidden"></p>
        <input id="confirmPassword" name="confirm" value="${confirm}" required />
        <p id="error-confirm" class="hidden"></p>
      </div>
      <p id="signupError" class="hidden"></p>
      <button type="submit">Continuar</button>
    </form>
  `;
}

function sliceRequired(source: string, startMarker: string, endMarker: string): string {
  const start = source.indexOf(startMarker);
  expect(start, `Missing start marker: ${startMarker}`).toBeGreaterThanOrEqual(0);
  const end = source.indexOf(endMarker, start + startMarker.length);
  expect(end, `Missing end marker: ${endMarker}`).toBeGreaterThan(start);
  return source.slice(start, end + endMarker.length);
}

describe('REGRESSION: signup password placement and lifetime', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    sessionStorage.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('/auth/signup/credentials source renders password and confirm password fields with visible labels', async () => {
    const source = await loadSource(CREDENTIALS_PAGE_PATH);
    const formMarkup = source;
    const passwordFields = sliceRequired(formMarkup, 'id="passwordFields"', 'id="error-confirm"');

    expect(passwordFields).toMatch(/<label[^>]*>\s*Contrase(?:ñ|&ntilde;)a\s*<\/label>/i);
    expect(passwordFields).toMatch(/<input[^>]*id="password"[^>]*name="password"[^>]*type="password"[^>]*autocomplete="new-password"[^>]*required/i);
    expect(passwordFields).toMatch(/<label[^>]*>\s*Confirmar\s*<\/label>/i);
    expect(passwordFields).toMatch(/<input[^>]*id="confirmPassword"[^>]*name="confirm"[^>]*type="password"[^>]*autocomplete="new-password"[^>]*required/i);
  });

  it('credentials controller keeps password in live runtime only and never persists it in storage or URL state', async () => {
    const [pageSource, controllerSource] = await Promise.all([
      loadSource(CREDENTIALS_PAGE_PATH),
      loadSource(CREDENTIALS_CONTROLLER_PATH)
    ]);
    const combinedSource = `${pageSource}\n${controllerSource}`;

    expect(controllerSource).toMatch(/form\.querySelector<HTMLInputElement>\(['"]input\[name=["']password["']\]["']\)\?\.value\s*\?\?\s*['"]['"]/);
    expect(controllerSource).toMatch(/createAndfinalizeFreeSignup\(\{[\s\S]{0,360}password:\s*values\.password[\s\S]{0,260}\}\)/);
    expect(controllerSource).toMatch(/finalizeFreeSignup\(\{[\s\S]{0,360}password:\s*freeSignupDraft\.password[\s\S]{0,360}businessType:/);

    expect(combinedSource).not.toMatch(/(?:localStorage|sessionStorage)\.setItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(combinedSource).not.toMatch(/(?:localStorage|sessionStorage)\.getItem\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(combinedSource).not.toMatch(/(?:searchParams|URLSearchParams)\.[a-zA-Z]+\([^)]*(?:password|confirmPassword|contraseñ)/i);
    expect(combinedSource).not.toMatch(/window\.location\.(?:href|assign|replace)[\s\S]{0,180}(?:password|confirmPassword|contraseñ)/i);
  });

  it('/auth/signup/onboarding source contains no password input or confirm-password field', async () => {
    const source = await loadSource(ONBOARDING_PAGE_PATH);
    const formMarkup = sliceRequired(source, '<form id="completeForm"', '</form>');

    expect(formMarkup).toMatch(/name="rubro"/i);
    expect(formMarkup).not.toMatch(/<input[^>]*type="password"/i);
    expect(formMarkup).not.toMatch(/<input[^>]*name="(?:password|confirm)"/i);
    expect(formMarkup).not.toMatch(/id="(?:password|confirmPassword|passwordFields|onboardingPassword|onboardingConfirmPassword)"/i);
  });

  it('paid plan credentials keep password fields visible and required', async () => {
    const { initSignupCredentialsPage } = await loadController();
    window.history.pushState({}, '', '/auth/signup/credentials?plan=STARTER&billing=monthly');
    sessionStorage.clear();
    renderPaidCredentialsForm();

    initSignupCredentialsPage({});

    expect(document.getElementById('passwordFields')?.classList.contains('hidden')).toBe(false);
    expect(document.getElementById('password')?.hasAttribute('required')).toBe(true);
    expect(document.getElementById('confirmPassword')?.hasAttribute('required')).toBe(true);
  });

  it('paid plan credentials validation blocks missing password without persisting or navigating', async () => {
    const { initSignupCredentialsPage } = await loadController();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/auth/signup/credentials?plan=STARTER&billing=monthly');
    sessionStorage.clear();
    renderPaidCredentialsForm('', '');

    initSignupCredentialsPage({});
    dispatchCredentialsSubmit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('error-password')?.classList.contains('hidden')).toBe(false);
    expect(window.location.href).toBe('http://localhost:3000/auth/signup/credentials?plan=STARTER&billing=monthly');
    expect(JSON.stringify(sessionStorage)).not.toMatch(/password|confirm/i);
  });

  it('paid plan credentials validation blocks mismatched password confirmation', async () => {
    const { initSignupCredentialsPage } = await loadController();
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    window.history.pushState({}, '', '/auth/signup/credentials?plan=GROWTH&billing=annual');
    sessionStorage.clear();
    renderPaidCredentialsForm('password-segura-123', 'password-distinta-456');

    initSignupCredentialsPage({});
    dispatchCredentialsSubmit();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(document.getElementById('error-confirm')?.classList.contains('hidden')).toBe(false);
    expect(window.location.href).toBe('http://localhost:3000/auth/signup/credentials?plan=GROWTH&billing=annual');
    expect(JSON.stringify(sessionStorage)).not.toContain('password-segura-123');
    expect(JSON.stringify(sessionStorage)).not.toContain('password-distinta-456');
  });
});
